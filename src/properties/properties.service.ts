import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PropertyImage } from '@prisma/client';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { FilterPropertyDto } from './dto/filter-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private whatsapp: WhatsappService,
  ) {}

  async create(createPropertyDto: CreatePropertyDto, userId: string) {
    return this.prisma.property.create({
      data: {
        ...createPropertyDto,
        userId,
      },
    });
  }

  async findAll(filters: FilterPropertyDto = {}) {
    return this.findWithFilters(filters);
  }

  async findWithFilters(filters: FilterPropertyDto) {
    const { skip = 0, take = 10, ...filterParams } = filters;

    const where = this.buildWhereClause(filterParams);

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        skip,
        take,
        where,
        include: {
          images: true,
          businessTypes: {
            include: {
              businessType: true,
            },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    return {
      data: properties,
      total,
      skip,
      take,
    };
  }

  async findOne(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        images: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!property) {
      throw new NotFoundException(`Propriedade com ID ${id} não encontrada`);
    }

    const whatsappNumber = this.whatsapp.getWhatsappNumber(id);

    return {
      ...property,
      whatsappContact: whatsappNumber,
    };
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    try {
      return await this.prisma.property.update({
        where: { id },
        data: updatePropertyDto,
      });
    } catch (error) {
      throw new NotFoundException(`Propriedade com ID ${id} não encontrada`);
    }
  }

  async remove(id: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!property) {
      throw new NotFoundException(`Propriedade com ID ${id} não encontrada`);
    }

    await this.deletePropertyImagesFromCloudinary(property.images);

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async uploadImages(propertyId: string, files: Express.Multer.File[]): Promise<string[]> {
    const uploadPromises = files.map((file) => this.processAndUploadImage(propertyId, file));
    return Promise.all(uploadPromises);
  }

  private async processAndUploadImage(
    propertyId: string,
    file: Express.Multer.File,
  ): Promise<string> {
    try {
      const compressedBuffer = await sharp(file.buffer)
        .resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const url = await this.cloudinary.uploadImage(
        compressedBuffer,
        `${propertyId}-${Date.now()}-${randomUUID()}`,
      );

      await this.prisma.propertyImage.create({
        data: { propertyId, url },
      });

      return url;
    } catch (error) {
      console.error('Erro ao processar imagem:', error);
      throw error;
    }
  }

  async deleteImage(imageId: string, userId: string) {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException(`Imagem com ID ${imageId} não encontrada`);
    }

    const property = await this.prisma.property.findUnique({
      where: { id: image.propertyId },
    });

    if (!property) {
      throw new NotFoundException(`Propriedade com ID ${image.propertyId} não encontrada`);
    }

    await this.deletePropertyImagesFromCloudinary([image]);

    return this.prisma.propertyImage.delete({
      where: { id: imageId },
    });
  }

  getWhatsappNumber(propertyId: string): string {
    return this.whatsapp.getWhatsappNumber(propertyId);
  }

  private buildWhereClause(filters: Partial<FilterPropertyDto>): Prisma.PropertyWhereInput {
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
    };

    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;

    if (filters.city) {
      where.city = { contains: filters.city, mode: 'insensitive' };
    }
    if (filters.neighborhood) {
      where.neighborhood = { contains: filters.neighborhood, mode: 'insensitive' };
    }
    if (filters.state) {
      where.state = { contains: filters.state, mode: 'insensitive' };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const rangeFilters = [
      { key: 'price', min: 'minPrice', max: 'maxPrice' },
      { key: 'totalArea', min: 'minTotalArea', max: 'maxTotalArea' },
      { key: 'builtArea', min: 'minBuiltArea', max: 'maxBuiltArea' },
      { key: 'bedrooms', min: 'minBedrooms', max: 'maxBedrooms' },
      { key: 'bathrooms', min: 'minBathrooms', max: 'maxBathrooms' },
      { key: 'parkingSpaces', min: 'minParkingSpaces', max: 'maxParkingSpaces' },
    ];

    rangeFilters.forEach(({ key, min, max }) => {
      if (filters[min] !== undefined || filters[max] !== undefined) {
        where[key] = {};
        if (filters[min] !== undefined) where[key].gte = filters[min];
        if (filters[max] !== undefined) where[key].lte = filters[max];
      }
    });

    if (filters.businessType) {
      where.businessTypes = {
        some: {
          businessType: {
            code: filters.businessType,
          },
        },
      };
    }

    return where;
  }

  private async deletePropertyImagesFromCloudinary(images: PropertyImage[]) {
    const deletePromises = images.map((image) => this.deleteImageFromCloudinary(image));

    await Promise.allSettled(deletePromises);
  }

  private async deleteImageFromCloudinary(image: PropertyImage): Promise<void> {
    try {
      const publicId = this.extractPublicId(image.url);
      await this.cloudinary.deleteImage(`real-estate-properties/${publicId}`);
    } catch (error) {
      console.warn(`Erro ao deletar imagem ${image.id} do Cloudinary:`, error);
    }
  }

  private extractPublicId(imageUrl: string): string {
    return imageUrl.split('/').slice(-1)[0].split('.')[0];
  }
}
