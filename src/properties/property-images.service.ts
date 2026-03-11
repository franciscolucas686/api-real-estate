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
    mainImage: PropertyImage;
    total: number;
  }> {
    const imageCount = await this.prisma.propertyImage.count({ where: { propertyId } });
    const isFirstBatch = imageCount === 0;

    const processedImages = await Promise.all(
      files.map(async (file, index) => ({
        file,
        isMain: isFirstBatch && index === 0,
      })),
    );

    const uploadedImages = await Promise.all(
      processedImages.map(({ file, isMain }) =>
        this.processAndUploadImage(propertyId, file, isMain),
      ),
    );

    return {
      images: uploadedImages,
      mainImage: uploadedImages[0],
      total: uploadedImages.length,
    };
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
      data: { propertyId, url, isMain },
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
