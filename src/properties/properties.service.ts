import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BusinessType,
  GeocodingStatus,
  Prisma,
  Property,
  PropertyType,
  SaleType,
} from '@prisma/client';
import {
  InvalidBusinessTypeConfigError,
  InvalidSubtypeDataError,
  PropertyForbiddenError,
  PropertyNotDeletedError,
  PropertyNotFoundError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import {
  ApartmentDetailsDto,
  CountryHouseDetailsDto,
  CreateApartmentDto,
  CreatePropertyDto,
  FilterPropertyDto,
  HouseDetailsDto,
  LandDetailsDto,
  PropertyCardDto,
  PropertyDetailDto,
  PropertyListResponseDto,
  SmallFarmDetailsDto,
  UpdatePropertyDto,
} from './dto';
import { PropertyImagesService } from './property-images.service';

const PREVIEW_LIMIT_ROOMS = 4;

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyImagesService: PropertyImagesService,
    private readonly whatsappService: WhatsappService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(createPropertyDto: CreatePropertyDto, userId: string) {
    const { house, apartment, land, smallFarm, countryHouse, saleTypes, ...propertyData } =
      createPropertyDto;

    this.validateSubtypeData(createPropertyDto);
    this.validateBusinessTypeConfig(propertyData.businessType, saleTypes);
    this.validateSuites(propertyData.suites, propertyData.bathrooms);

    const normalizedApartment = apartment ? this.normalizeApartmentFloor(apartment) : apartment;

    const property = await this.createWithRetry(propertyData, userId, saleTypes, {
      house,
      apartment: normalizedApartment,
      land,
      smallFarm,
      countryHouse,
    });

    this.eventEmitter.emit('property.saved', { neighborhoodId: property.neighborhoodId });

    return property;
  }

  private async createWithRetry(
    propertyData: Omit<
      CreatePropertyDto,
      'house' | 'apartment' | 'land' | 'smallFarm' | 'countryHouse' | 'saleTypes'
    >,
    userId: string,
    saleTypes: SaleType[] | undefined,
    subtypes: {
      house?: CreatePropertyDto['house'];
      apartment?: CreateApartmentDto & { floor: number };
      land?: CreatePropertyDto['land'];
      smallFarm?: CreatePropertyDto['smallFarm'];
      countryHouse?: CreatePropertyDto['countryHouse'];
    },
    attempt = 0,
  ): Promise<Property> {
    const maxAttempts = 5;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      return await this.prisma.property.create({
        data: {
          ...propertyData,
          code,
          userId,
          ...(propertyData.businessType === BusinessType.SALE &&
            saleTypes && {
              saleTypes: {
                create: saleTypes.map((type) => ({ type })),
              },
            }),
          ...(subtypes.house && { house: { create: subtypes.house } }),
          ...(subtypes.apartment && { apartment: { create: subtypes.apartment } }),
          ...(subtypes.land && { land: { create: subtypes.land } }),
          ...(subtypes.smallFarm && { smallfarm: { create: subtypes.smallFarm } }),
          ...(subtypes.countryHouse && { countryhouse: { create: subtypes.countryHouse } }),
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
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        attempt < maxAttempts
      ) {
        return this.createWithRetry(propertyData, userId, saleTypes, subtypes, attempt + 1);
      }
      throw error;
    }
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

  private validateSuites(suites: number | undefined | null, bathrooms: number | undefined | null) {
    if (suites != null && bathrooms != null && suites > bathrooms) {
      throw new InvalidSubtypeDataError(
        `Suítes (${suites}) não pode ser maior que o número de banheiros (${bathrooms})`,
      );
    }
  }

  private normalizeApartmentFloor(
    apartment: CreatePropertyDto['apartment'],
  ): (CreateApartmentDto & { floor: number }) | undefined {
    if (!apartment) return apartment;

    if (apartment.isGroundFloor === true) {
      return { ...apartment, floor: 0 };
    }

    if (apartment.floor == null) {
      throw new InvalidSubtypeDataError(
        'O campo "floor" é obrigatório quando isGroundFloor não é true',
      );
    }

    return apartment as CreateApartmentDto & { floor: number };
  }

  async findAll(filters: FilterPropertyDto = {}): Promise<PropertyListResponseDto> {
    return this.findWithFilters(filters);
  }

  async findWithFilters(filters: FilterPropertyDto): Promise<PropertyListResponseDto> {
    const { skip = 0, take = 10, sort = 'newest', ...filterParams } = filters;

    const where = this.buildWhereClause(filterParams);
    const orderBy: Prisma.PropertyOrderByWithRelationInput = {
      createdAt: sort === 'newest' ? 'desc' : 'asc',
    };

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        skip,
        take,
        where,
        orderBy,
        select: {
          id: true,
          code: true,
          type: true,
          businessType: true,
          price: true,
          rentPrice: true,
          neighborhood: {
            select: { displayName: true, city: true, state: true },
          },
          bedrooms: true,
          suites: true,
          bathrooms: true,
          parkingSpaces: true,
          rooms: {
            orderBy: { order: 'asc' },
            take: PREVIEW_LIMIT_ROOMS,
            select: {
              images: {
                orderBy: { order: 'asc' },
                take: 1,
                select: {
                  id: true,
                  url: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.property.count({ where }),
    ]);

    const data: PropertyCardDto[] = properties.map((property) => ({
      id: property.id,
      code: property.code,
      type: property.type,
      businessType: property.businessType,
      price: property.price.toString(),
      rentPrice: property.rentPrice?.toString() ?? null,
      city: property.neighborhood.city,
      state: property.neighborhood.state,
      neighborhood: property.neighborhood.displayName,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      parkingSpaces: property.parkingSpaces,
      previewImages: property.rooms
        .filter((room) => room.images.length > 0)
        .map((room) => ({
          id: room.images[0].id,
          url: room.images[0].url,
        })),
    }));

    return {
      data,
      total,
      skip,
      take,
    };
  }

  async findOne(id: string): Promise<PropertyDetailDto> {
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
        neighborhood: { include: { locationCache: true } },
      },
    });

    if (!property) {
      throw new PropertyNotFoundError(id);
    }

    const whatsappNumber = this.whatsappService.getWhatsappNumber(id);
    const unassignedImages = property.images.filter((img) => !img.roomId);
    const unassignedMapped = unassignedImages.map((img) => ({
      id: img.id,
      url: img.url,
      label: img.label,
      order: img.order,
    }));

    const cache = property.neighborhood.locationCache;
    const coords =
      cache?.status === GeocodingStatus.RESOLVED &&
      cache.latitude != null &&
      cache.longitude != null
        ? { latitude: cache.latitude, longitude: cache.longitude }
        : null;

    let details:
      | HouseDetailsDto
      | ApartmentDetailsDto
      | LandDetailsDto
      | SmallFarmDetailsDto
      | CountryHouseDetailsDto
      | null = null;

    if (property.type === PropertyType.HOUSE && property.house) {
      details = {
        floors: property.house.floors,
        isInCondominium: property.house.isInCondominium ?? false,
        condominiumName: property.house.condominiumName ?? null,
        condominiumAmenities: property.house.condominiumAmenities ?? null,
      };
    } else if (property.type === PropertyType.APARTMENT && property.apartment) {
      details = {
        floor: property.apartment.floor,
        isGroundFloor: property.apartment.isGroundFloor ?? null,
        hasElevator: property.apartment.hasElevator,
        hasBalcony: property.apartment.hasBalcony,
        sunPosition: property.apartment.sunPosition,
        hasPool: property.apartment.hasPool ?? null,
      };
    } else if (property.type === PropertyType.LAND && property.land) {
      details = {
        zoning: property.land.zoning,
        topography: property.land.topography,
      };
    } else if (property.type === PropertyType.SMALL_FARM && property.smallfarm) {
      details = {
        hasHouse: property.smallfarm.hasHouse,
        hasPool: property.smallfarm.hasPool,
        hasLake: property.smallfarm.hasLake,
        hasFruitTrees: property.smallfarm.hasFruitTrees,
        waterSource: property.smallfarm.waterSource,
      };
    } else if (property.type === PropertyType.COUNTRY_HOUSE && property.countryhouse) {
      details = {
        hasRiver: property.countryhouse.hasRiver,
        hasSpring: property.countryhouse.hasSpring,
      };
    }

    return {
      id: property.id,
      code: property.code,
      type: property.type,
      businessType: property.businessType,
      saleTypes: property.saleTypes.map((st) => ({ id: st.id, type: st.type })),
      price: property.price.toString(),
      rentPrice: property.rentPrice?.toString() ?? null,
      condoFee: property.condoFee?.toString() ?? null,
      city: property.neighborhood.city,
      state: property.neighborhood.state,
      neighborhood: property.neighborhood.displayName,
      description: property.description,
      totalArea: property.totalArea,
      builtArea: property.builtArea,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      suites: property.suites,
      parkingSpaces: property.parkingSpaces,
      gallery: {
        ...(unassignedMapped.length > 0 && { unassigned: unassignedMapped }),
        rooms: property.rooms.map((room) => ({
          id: room.id,
          name: room.name,
          order: room.order,
          images: room.images.map((img) => ({
            id: img.id,
            url: img.url,
            label: img.label,
            order: img.order,
          })),
        })),
      },
      details,
      location: coords
        ? {
            latitude: coords.latitude,
            longitude: coords.longitude,
            neighborhood: property.neighborhood.displayName,
            city: property.neighborhood.city,
            state: property.neighborhood.state,
          }
        : null,
      whatsappContact: whatsappNumber,
      userId: property.userId,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    };
  }

  async update(id: string, updatePropertyDto: UpdatePropertyDto) {
    const { saleTypes, ...propertyData } = updatePropertyDto;
    const hasSaleTypesUpdate = saleTypes !== undefined;
    const hasBusinessTypeUpdate = propertyData.businessType !== undefined;
    const hasSuitesOrBathroomsUpdate =
      propertyData.suites !== undefined || propertyData.bathrooms !== undefined;

    // Only fetch current property if we need to validate business rules
    const needsValidation =
      hasSaleTypesUpdate || hasBusinessTypeUpdate || hasSuitesOrBathroomsUpdate;
    let currentProperty: {
      businessType: BusinessType;
      saleTypes: { type: SaleType }[];
      suites: number | null;
      bathrooms: number | null;
    } | null = null;

    if (needsValidation) {
      currentProperty = await this.prisma.property.findUnique({
        where: { id },
        select: {
          businessType: true,
          saleTypes: { select: { type: true } },
          suites: true,
          bathrooms: true,
        },
      });

      if (!currentProperty) {
        throw new PropertyNotFoundError(id);
      }

      const newBusinessType = propertyData.businessType ?? currentProperty.businessType;
      const effectiveSaleTypes = saleTypes ?? currentProperty.saleTypes.map((st) => st.type);
      this.validateBusinessTypeConfig(newBusinessType, effectiveSaleTypes);

      if (hasSuitesOrBathroomsUpdate) {
        const effectiveSuites = propertyData.suites ?? currentProperty.suites;
        const effectiveBathrooms = propertyData.bathrooms ?? currentProperty.bathrooms;
        this.validateSuites(effectiveSuites, effectiveBathrooms);
      }
    }

    try {
      const updatedProperty = await this.prisma.$transaction(async (tx) => {
        if (
          hasSaleTypesUpdate ||
          (hasBusinessTypeUpdate && propertyData.businessType === BusinessType.RENT)
        ) {
          await tx.propertySaleType.deleteMany({ where: { propertyId: id } });

          if (hasSaleTypesUpdate && saleTypes.length > 0) {
            const newBusinessType = propertyData.businessType ?? currentProperty?.businessType;
            if (newBusinessType === BusinessType.SALE) {
              await tx.propertySaleType.createMany({
                data: saleTypes.map((type) => ({ propertyId: id, type })),
              });
            }
          }
        }

        return tx.property.update({
          where: { id },
          data: propertyData,
          include: { saleTypes: true },
        });
      });

      this.eventEmitter.emit('property.saved', { neighborhoodId: updatedProperty.neighborhoodId });

      return updatedProperty;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new PropertyNotFoundError(id);
      }
      throw error;
    }
  }

  async hardDelete(id: string, userId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({ where: { id } });

    if (!property) {
      throw new PropertyNotFoundError(id);
    }

    if (property.userId !== userId) {
      throw new PropertyForbiddenError(id);
    }

    await this.propertyImagesService.deleteAllPropertyImagesFromR2(id);
    await this.prisma.property.delete({ where: { id } });
  }

  async remove(id: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new PropertyNotFoundError(id);
    }

    await this.propertyImagesService.movePropertyImagesToDeleted(id);

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: string, userId: string): Promise<Property> {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw new PropertyNotFoundError(id);
    }

    if (!property.deletedAt) {
      throw new PropertyNotDeletedError(id);
    }

    if (property.userId !== userId) {
      throw new PropertyForbiddenError(id);
    }

    await this.propertyImagesService.restorePropertyImages(id);

    return this.prisma.property.update({
      where: { id },
      data: { deletedAt: null },
    });
  }

  private buildWhereClause(filters: Partial<FilterPropertyDto>): Prisma.PropertyWhereInput {
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
    };

    if (filters.types && filters.types.length > 0) {
      where.type = { in: filters.types };
    }

    if (filters.code) {
      where.code = { contains: filters.code, mode: 'insensitive' };
    }

    const neighborhoodFilter: Prisma.NeighborhoodWhereInput = {};
    if (filters.city) neighborhoodFilter.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.state) neighborhoodFilter.state = { contains: filters.state, mode: 'insensitive' };
    if (filters.neighborhood)
      neighborhoodFilter.displayName = { contains: filters.neighborhood, mode: 'insensitive' };
    if (Object.keys(neighborhoodFilter).length > 0) where.neighborhood = neighborhoodFilter;

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
}
