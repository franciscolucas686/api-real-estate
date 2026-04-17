import { Injectable } from '@nestjs/common';
import { Prisma, Property, PropertyImage, PropertyRoom, PropertyType } from '@prisma/client';
import { InvalidSubtypeDataError, PropertyNotFoundError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreatePropertyDto, FilterPropertyDto, UpdatePropertyDto } from './dto';
import { PropertyImagesService } from './property-images.service';

const PREVIEW_LIMIT_ROOMS = 4;

type RoomWithImages = PropertyRoom & { images: PropertyImage[] };
type PropertyWithRooms = Property & { rooms: RoomWithImages[] };

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyImagesService: PropertyImagesService,
    private readonly whatsappService: WhatsappService,
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
      throw new InvalidSubtypeDataError(
        `Para o tipo ${dto.type}, o campo "${expected.field}" é obrigatório`,
      );
    }

    const otherSubtypes = Object.entries(subtypeMap).filter(([type]) => type !== dto.type);

    for (const [, { field, data }] of otherSubtypes) {
      if (data) {
        throw new InvalidSubtypeDataError(
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
          rooms: {
            orderBy: { order: 'asc' },
            take: PREVIEW_LIMIT_ROOMS,
            include: {
              images: {
                orderBy: { order: 'asc' },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    const data = properties.map((property) => {
      const { rooms, ...rest } = property;
      return {
        ...rest,
        previewImages: this.extractPreviewImages(property),
      };
    });

    return {
      data,
      total,
      skip,
      take,
    };
  }

  async findOne(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: {
        images: {
          orderBy: { order: 'asc' },
        },
        rooms: {
          orderBy: { order: 'asc' },
          include: {
            images: {
              orderBy: { order: 'asc' },
            },
          },
        },
        house: true,
        apartment: true,
        land: true,
        smallfarm: true,
        countryhouse: true,
      },
    });

    if (!property) {
      throw new PropertyNotFoundError(id);
    }

    const whatsappNumber = this.whatsappService.getWhatsappNumber(id);

    const unassignedImages = property.images.filter((img) => !img.roomId);

    return {
      ...property,
      whatsappContact: whatsappNumber,
      gallery: {
        unassigned: unassignedImages,
        rooms: property.rooms,
      },
    };
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    try {
      return await this.prisma.property.update({
        where: { id },
        data: updatePropertyDto,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new PropertyNotFoundError(id);
      }
      throw error;
    }
  }

  async remove(id: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: { images: true },
    });

    if (!property) {
      throw new PropertyNotFoundError(id);
    }

    await this.propertyImagesService.deleteImagesFromR2(property.images);

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private buildWhereClause(filters: Partial<FilterPropertyDto>): Prisma.PropertyWhereInput {
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
    };

    if (filters.type) where.type = filters.type;

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
      where.description = { contains: filters.search, mode: 'insensitive' };
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

  private extractPreviewImages(property: PropertyWithRooms): PropertyImage[] {
    return property.rooms.filter((room) => room.images.length > 0).map((room) => room.images[0]);
  }
}
