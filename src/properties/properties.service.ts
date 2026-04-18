import { Injectable } from '@nestjs/common';
import {
  BusinessType,
  Prisma,
  Property,
  PropertyImage,
  PropertyRoom,
  PropertyType,
  SaleType,
} from '@prisma/client';
import {
  InvalidBusinessTypeConfigError,
  InvalidSubtypeDataError,
  PropertyNotFoundError,
} from '../common/errors';
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
    const { house, apartment, land, smallFarm, countryHouse, saleTypes, ...propertyData } =
      createPropertyDto;

    this.validateSubtypeData(createPropertyDto);
    this.validateBusinessTypeConfig(propertyData.businessType, saleTypes);

    return this.prisma.property.create({
      data: {
        ...propertyData,
        userId,
        ...(propertyData.businessType === BusinessType.SALE &&
          saleTypes && {
            saleTypes: {
              create: saleTypes.map((type) => ({ type })),
            },
          }),
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
        saleTypes: true,
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

  private validateBusinessTypeConfig(businessType: BusinessType, saleTypes?: SaleType[]) {
    if (businessType === BusinessType.RENT && saleTypes && saleTypes.length > 0) {
      throw new InvalidBusinessTypeConfigError(
        'Propriedades de aluguel não podem ter tipos de venda',
      );
    }

    if (businessType === BusinessType.SALE && (!saleTypes || saleTypes.length === 0)) {
      throw new InvalidBusinessTypeConfigError(
        'Propriedades de venda devem ter pelo menos um tipo de venda',
      );
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
        saleTypes: true,
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
    const { saleTypes, ...propertyData } = updatePropertyDto;

    try {
      const currentProperty = await this.prisma.property.findUnique({
        where: { id },
        include: { saleTypes: true },
      });

      if (!currentProperty) {
        throw new PropertyNotFoundError(id);
      }

      const newBusinessType = propertyData.businessType ?? currentProperty.businessType;

      if (saleTypes !== undefined || propertyData.businessType !== undefined) {
        const effectiveSaleTypes = saleTypes ?? currentProperty.saleTypes.map((st) => st.type);
        this.validateBusinessTypeConfig(newBusinessType, effectiveSaleTypes);
      }

      return await this.prisma.$transaction(async (tx) => {
        const updatedProperty = await tx.property.update({
          where: { id },
          data: propertyData,
        });

        if (saleTypes !== undefined) {
          await tx.propertySaleType.deleteMany({ where: { propertyId: id } });

          if (newBusinessType === BusinessType.SALE && saleTypes.length > 0) {
            await tx.propertySaleType.createMany({
              data: saleTypes.map((type) => ({ propertyId: id, type })),
            });
          }
        }

        if (propertyData.businessType === BusinessType.RENT && saleTypes === undefined) {
          await tx.propertySaleType.deleteMany({ where: { propertyId: id } });
        }

        return tx.property.findUnique({
          where: { id },
          include: { saleTypes: true },
        });
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

    if (filters.saleTypes && filters.saleTypes.length > 0) {
      where.saleTypes = {
        some: {
          type: { in: filters.saleTypes },
        },
      };
    }

    return where;
  }

  private extractPreviewImages(property: PropertyWithRooms): PropertyImage[] {
    return property.rooms.filter((room) => room.images.length > 0).map((room) => room.images[0]);
  }
}
