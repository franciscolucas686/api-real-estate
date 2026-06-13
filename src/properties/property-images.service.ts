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
import {
  BulkDeletePropertyImagesDto,
  ReorderPropertyImagesDto,
  UpdatePropertyImageDto,
} from './dto';

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
    total: number;
  }> {
    const lastImage = await this.prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { order: 'desc' },
    });
    const startOrder = (lastImage?.order ?? -1) + 1;

    const uploadedImages = await Promise.all(
      files.map((file, index) =>
        this.processAndUploadImage(propertyId, file, startOrder + index, roomId),
      ),
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

  async bulkDeleteImages(propertyId: string, dto: BulkDeletePropertyImagesDto): Promise<void> {
    const images = await this.prisma.propertyImage.findMany({
      where: { id: { in: dto.imageIds }, propertyId },
    });

    if (images.length !== dto.imageIds.length) {
      throw new ImageNotBelongToPropertyError('uma ou mais imagens', propertyId);
    }

    const keys = images.map((img) => this.r2.getObjectKeyFromUrl(img.url));

    await this.r2.deleteImages(keys);

    try {
      await this.prisma.propertyImage.deleteMany({
        where: { id: { in: dto.imageIds } },
      });
    } catch (error) {
      this.logger.error(
        `R2 deletado mas falha ao remover registros do banco para propertyId=${propertyId}:`,
        error,
      );
    }
  }

  async deleteImagesFromR2(images: PropertyImage[]) {
    const deletePromises = images.map((image) => this.deleteImageFromR2(image));
    await Promise.allSettled(deletePromises);
  }

  async deletePropertyImagesFromR2(propertyId: string): Promise<void> {
    try {
      await this.r2.deleteObjectsByPrefix(`${propertyId}/`);
    } catch (error) {
      this.logger.warn(`Erro ao deletar imagens do imóvel ${propertyId} do R2:`, error);
    }
  }

  async deleteAllPropertyImagesFromR2(propertyId: string): Promise<void> {
    await Promise.all([
      this.r2
        .deleteObjectsByPrefix(`${propertyId}/`)
        .catch((error) =>
          this.logger.warn(`Erro ao deletar imagens ativas do imóvel ${propertyId} do R2:`, error),
        ),
      this.r2
        .deleteObjectsByPrefix(`deleted/${propertyId}/`)
        .catch((error) =>
          this.logger.warn(
            `Erro ao deletar imagens deletadas do imóvel ${propertyId} do R2:`,
            error,
          ),
        ),
    ]);
  }

  async movePropertyImagesToDeleted(propertyId: string): Promise<void> {
    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId },
    });

    if (images.length === 0) return;

    await Promise.all(
      images.map(async (image) => {
        try {
          const sourceKey = this.r2.getObjectKeyFromUrl(image.url);
          const fileName = sourceKey.slice(sourceKey.indexOf('/') + 1);
          const destKey = `deleted/${propertyId}/${fileName}`;
          const newUrl = await this.r2.moveObject(sourceKey, destKey);
          await this.prisma.propertyImage.update({
            where: { id: image.id },
            data: { url: newUrl },
          });
        } catch (error) {
          this.logger.warn(`Erro ao mover imagem ${image.id} para deleted:`, error);
        }
      }),
    );
  }

  async restorePropertyImages(propertyId: string): Promise<void> {
    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId },
    });

    if (images.length === 0) return;

    await Promise.all(
      images.map(async (image) => {
        try {
          const sourceKey = this.r2.getObjectKeyFromUrl(image.url);
          const fileName = sourceKey.slice(sourceKey.lastIndexOf('/') + 1);
          const destKey = `${propertyId}/${fileName}`;
          const newUrl = await this.r2.moveObject(sourceKey, destKey);
          await this.prisma.propertyImage.update({
            where: { id: image.id },
            data: { url: newUrl },
          });
        } catch (error) {
          this.logger.warn(`Erro ao restaurar imagem ${image.id}:`, error);
        }
      }),
    );
  }

  private async processAndUploadImage(
    propertyId: string,
    file: Express.Multer.File,
    order: number,
    roomId?: string,
  ): Promise<PropertyImage> {
    const compressedBuffer = await sharp(file.buffer)
      .rotate()
      .resize(1920, 1080, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toBuffer();

    const key = `${propertyId}/${Date.now()}-${randomUUID()}.jpg`;
    const url = await this.r2.uploadImage(compressedBuffer, key, 'image/jpeg');

    return this.prisma.propertyImage.create({
      data: { propertyId, url, order, ...(roomId && { roomId }) },
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
