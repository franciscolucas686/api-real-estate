import { Injectable, Logger } from '@nestjs/common';
import { PropertyImage } from '@prisma/client';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import {
  ImageNotBelongToPropertyError,
  ImageNotFoundError,
  PropertyNotFoundError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { ReorderPropertyImagesDto, UpdatePropertyImageDto } from './dto';

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
  ): Promise<{
    images: PropertyImage[];
    total: number;
  }> {
    const lastImage = await this.prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { order: 'desc' },
    });
    const startOrder = (lastImage?.order ?? -1) + 1;

    const uploadedImages = await Promise.all(
      files.map((file, index) => this.processAndUploadImage(propertyId, file, startOrder + index)),
    );

    return {
      images: uploadedImages,
      total: uploadedImages.length,
    };
  }

  async updateImage(
    propertyId: string,
    imageId: string,
    dto: Omit<UpdatePropertyImageDto, 'roomId'>,
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

    return this.prisma.propertyImage.update({
      where: { id: imageId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });
  }

  async reorderImages(propertyId: string, dto: ReorderPropertyImagesDto): Promise<PropertyImage[]> {
    const imageIds = dto.items.map((item) => item.imageId);
    const images = await this.prisma.propertyImage.findMany({
      where: { id: { in: imageIds }, propertyId },
    });

    if (images.length !== imageIds.length) {
      throw new ImageNotBelongToPropertyError('uma ou mais imagens', propertyId);
    }

    const roomIds = [
      ...new Set(
        dto.items.map((item) => item.roomId).filter((id): id is string => typeof id === 'string'),
      ),
    ];

    if (roomIds.length > 0) {
      const rooms = await this.prisma.propertyRoom.findMany({
        where: { id: { in: roomIds }, propertyId },
      });

      if (rooms.length !== roomIds.length) {
        throw new ImageNotBelongToPropertyError('um ou mais comodos', propertyId);
      }
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.propertyImage.update({
          where: { id: item.imageId },
          data: {
            order: item.order,
            ...(item.roomId !== undefined && { roomId: item.roomId }),
          },
        }),
      ),
    );

    return this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
    });
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

  async deletePropertyImagesFromR2(propertyId: string): Promise<void> {
    try {
      await this.r2.deleteObjectsByPrefix(`real-estate-properties/${propertyId}/`);
    } catch (error) {
      this.logger.warn(`Erro ao deletar imagens do imóvel ${propertyId} do R2:`, error);
    }
  }

  private async processAndUploadImage(
    propertyId: string,
    file: Express.Multer.File,
    order: number,
  ): Promise<PropertyImage> {
    const compressedBuffer = await sharp(file.buffer)
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const key = `real-estate-properties/${propertyId}/${Date.now()}-${randomUUID()}.jpg`;
    const url = await this.r2.uploadImage(compressedBuffer, key, 'image/jpeg');

    return this.prisma.propertyImage.create({
      data: { propertyId, url, order },
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
