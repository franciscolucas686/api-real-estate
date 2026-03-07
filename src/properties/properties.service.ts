import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PropertyImage, PropertyType } from '@prisma/client';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { FilterPropertyDto } from './dto/filter-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';

@Injectable()
export class PropertiesService {
  constructor(
    private prisma: PrismaService,
    private r2: R2Service,
    private whatsapp: WhatsappService,
  ) {}

  async create(createPropertyDto: CreatePropertyDto, userId: string) {
    const { house, apartment, land, smallFarm, countryHouse, ...propertyData } = createPropertyDto;

    this.validateSubtypeData(createPropertyDto);

    return this.prisma.property.create({
      data: {
        ...propertyData,
        userId,
        ...(house && { house: { create: house } }),
        ...(apartment && { apartment: { create: apartment } }),
        ...(land && { land: { create: land } }),
        ...(smallFarm && { smallfarm: { create: smallFarm } }),
        ...(countryHouse && { countryhouse: { create: countryHouse } }),
      },
      include: {
        house: true,
        apartment: true,
        land: true,
        smallfarm: true,
        countryhouse: true,
      },
    });
  }

  private validateSubtypeData(dto: CreatePropertyDto) {
    const subtypeMap: Record<PropertyType, { field: string; data: unknown }> = {
      [PropertyType.HOUSE]: { field: 'house', data: dto.house },
      [PropertyType.APARTMENT]: { field: 'apartment', data: dto.apartment },
      [PropertyType.LAND]: { field: 'land', data: dto.land },
      [PropertyType.SMALL_FARM]: { field: 'smallFarm', data: dto.smallFarm },
      [PropertyType.COUNTRY_HOUSE]: { field: 'countryHouse', data: dto.countryHouse },
    };

    const expected = subtypeMap[dto.type];

    if (!expected.data) {
      throw new BadRequestException(
        `Para o tipo ${dto.type}, o campo "${expected.field}" é obrigatório`,
      );
    }

    const otherSubtypes = Object.entries(subtypeMap).filter(([type]) => type !== dto.type);

    for (const [, { field, data }] of otherSubtypes) {
      if (data) {
        throw new BadRequestException(
          `O campo "${field}" não deve ser enviado para o tipo ${dto.type}`,
        );
      }
    }
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
        house: true,
        apartment: true,
        land: true,
        smallfarm: true,
        countryhouse: true,
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
      this.logger.error(`Erro ao atualizar propriedade ${id}:`, error);
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

    await this.deletePropertyImagesFromR2(property.images);

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

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

  private readonly logger = new Logger(PropertiesService.name);

  private async processAndUploadImage(
    propertyId: string,
    file: Express.Multer.File,
    isMain: boolean,
  ): Promise<PropertyImage> {
    try {
      const compressedBuffer = await sharp(file.buffer)
        .resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const key = `real-estate-properties/${propertyId}-${Date.now()}-${randomUUID()}.jpg`;
      const url = await this.r2.uploadImage(compressedBuffer, key, 'image/jpeg');

      const image = await this.prisma.propertyImage.create({
        data: { propertyId, url, isMain },
      });

      return image;
    } catch (error) {
      this.logger.error(`Erro ao processar imagem para propriedade ${propertyId}:`, error);
      throw error;
    }
  }

  async setMainImage(propertyId: string, imageId: string): Promise<PropertyImage> {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new NotFoundException(`Imagem com ID ${imageId} não encontrada`);
    }

    if (image.propertyId !== propertyId) {
      throw new NotFoundException(`Imagem com ID ${imageId} não pertence ao imóvel ${propertyId}`);
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
      throw new NotFoundException(`Imagem com ID ${imageId} não encontrada`);
    }

    return updatedImage;
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

    await this.deletePropertyImagesFromR2([image]);

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
    ] as const;

    const filtersRecord = filters as Record<string, number | undefined>;

    rangeFilters.forEach(({ key, min, max }) => {
      const minValue = filtersRecord[min];
      const maxValue = filtersRecord[max];

      if (minValue !== undefined || maxValue !== undefined) {
        const range: { gte?: number; lte?: number } = {};
        if (minValue !== undefined) range.gte = minValue;
        if (maxValue !== undefined) range.lte = maxValue;
        (where as Record<string, unknown>)[key] = range;
      }
    });

    if (filters.businessType) {
      where.businessType = filters.businessType;
    }

    return where;
  }

  private async deletePropertyImagesFromR2(images: PropertyImage[]) {
    const deletePromises = images.map((image) => this.deleteImageFromR2(image));

    await Promise.allSettled(deletePromises);
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
