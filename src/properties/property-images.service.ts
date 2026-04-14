import { Injectable, Logger } from '@nestjs/common';
import { PropertyImage } from '@prisma/client';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import {
  ImageNotBelongToPropertyError,
  ImageNotFoundError,
  PropertyNotFoundError,
  RoomNotBelongToPropertyError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { ReorderImagesDto } from './dto/reorder-images.dto';
import { UpdatePropertyImageDto } from './dto/update-property-image.dto';

@Injectable()
export class PropertyImagesService {
  private readonly logger = new Logger(PropertyImagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  async uploadImages(
    propertyId: string,
    files: Express.Multer.File[],
    roomId?: string,
  ): Promise<{
    images: PropertyImage[];
    mainImage: PropertyImage;
    total: number;
  }> {
    if (roomId) {
      const room = await this.prisma.propertyRoom.findUnique({
        where: { id: roomId },
      });
      if (!room || room.propertyId !== propertyId) {
        throw new RoomNotBelongToPropertyError(roomId, propertyId);
      }
    }

    const imageCount = await this.prisma.propertyImage.count({ where: { propertyId } });
    const isFirstBatch = imageCount === 0;

    const lastImage = await this.prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { order: 'desc' },
    });
    const startOrder = (lastImage?.order ?? -1) + 1;

    const processedImages = files.map((file, index) => ({
      file,
      isMain: isFirstBatch && index === 0,
      order: startOrder + index,
      roomId: roomId ?? null,
    }));

    const uploadedImages = await Promise.all(
      processedImages.map(({ file, isMain, order, roomId }) =>
        this.processAndUploadImage(propertyId, file, isMain, order, roomId),
      ),
    );

    return {
      images: uploadedImages,
      mainImage: uploadedImages[0],
      total: uploadedImages.length,
    };
  }

  async updateImage(
    propertyId: string,
    imageId: string,
    dto: UpdatePropertyImageDto,
  ): Promise<PropertyImage> {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new ImageNotFoundError(imageId);
    }

    if (image.propertyId !== propertyId) {
      throw new ImageNotBelongToPropertyError(imageId, propertyId);
    }

    if (dto.roomId) {
      const room = await this.prisma.propertyRoom.findUnique({
        where: { id: dto.roomId },
      });
      if (!room || room.propertyId !== propertyId) {
        throw new RoomNotBelongToPropertyError(dto.roomId, propertyId);
      }
    }

    return this.prisma.propertyImage.update({
      where: { id: imageId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.order !== undefined && { order: dto.order }),
        ...(dto.roomId !== undefined && { roomId: dto.roomId }),
      },
    });
  }

  async reorderImages(propertyId: string, dto: ReorderImagesDto): Promise<PropertyImage[]> {
    const imageIds = dto.items.map((item) => item.imageId);
    const images = await this.prisma.propertyImage.findMany({
      where: { id: { in: imageIds }, propertyId },
    });

    if (images.length !== imageIds.length) {
      throw new ImageNotBelongToPropertyError('uma ou mais imagens', propertyId);
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.propertyImage.update({
          where: { id: item.imageId },
          data: { order: item.order },
        }),
      ),
    );

    return this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
    });
  }

  async setMainImage(propertyId: string, imageId: string): Promise<PropertyImage> {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new ImageNotFoundError(imageId);
    }

    if (image.propertyId !== propertyId) {
      throw new ImageNotBelongToPropertyError(imageId, propertyId);
    }

    await Promise.all([
      this.prisma.propertyImage.updateMany({
        where: {
          propertyId,
          id: { not: imageId },
          isMain: true,
        },
        data: { isMain: false },
      }),
      this.prisma.propertyImage.update({
        where: { id: imageId },
        data: { isMain: true },
      }),
    ]);

    const updatedImage = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!updatedImage) {
      throw new ImageNotFoundError(imageId);
    }

    return updatedImage;
  }

  async deleteImage(imageId: string, userId: string) {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new ImageNotFoundError(imageId);
    }

    const property = await this.prisma.property.findUnique({
      where: { id: image.propertyId },
    });

    if (!property) {
      throw new PropertyNotFoundError(image.propertyId);
    }

    await this.deleteImagesFromR2([image]);

    return this.prisma.propertyImage.delete({
      where: { id: imageId },
    });
  }

  async deleteImagesFromR2(images: PropertyImage[]) {
    const deletePromises = images.map((image) => this.deleteImageFromR2(image));
    await Promise.allSettled(deletePromises);
  }

  private async processAndUploadImage(
    propertyId: string,
    file: Express.Multer.File,
    isMain: boolean,
    order: number,
    roomId: string | null,
  ): Promise<PropertyImage> {
    const compressedBuffer = await sharp(file.buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const key = `real-estate-properties/${propertyId}-${Date.now()}-${randomUUID()}.jpg`;
    const url = await this.r2.uploadImage(compressedBuffer, key, 'image/jpeg');

    return this.prisma.propertyImage.create({
      data: { propertyId, url, isMain, order, roomId },
    });
  }

  private async deleteImageFromR2(image: PropertyImage): Promise<void> {
    try {
      const key = this.r2.getObjectKeyFromUrl(image.url);
      await this.r2.deleteImage(key);
    } catch (error) {
      this.logger.warn(`Erro ao deletar imagem ${image.id} do R2:`, error);
    }
  }
}
