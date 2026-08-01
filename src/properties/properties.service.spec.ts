import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BusinessType,
  PropertyStatus,
  PropertyType,
  SaleType,
  Topography,
  Zoning,
} from '@prisma/client';
import { InvalidBusinessTypeConfigError, InvalidSubtypeDataError } from '../common/errors';
import { GeocodingService } from '../geocoding/geocoding.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { CreatePropertyDto, UpdatePropertyDto } from './dto';
import { PropertyImagesService } from './property-images.service';
import { PropertyStatusService } from './property-status.service';
import { PropertiesService } from './properties.service';

function baseDto(overrides: Partial<CreatePropertyDto> = {}): CreatePropertyDto {
  return {
    description: 'Descrição válida com mais de dez caracteres',
    type: PropertyType.LAND,
    neighborhood: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.DIRECT],
    price: '100000.00',
    totalArea: 500,
    land: { zoning: Zoning.RESIDENTIAL, topography: Topography.FLAT },
    ...overrides,
  } as CreatePropertyDto;
}

describe('PropertiesService', () => {
  let service: PropertiesService;

  const mockPrismaService = {
    property: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    propertyImage: {
      count: jest.fn(),
    },
  };

  const mockPropertyImagesService = {};
  const mockWhatsappService = {};
  const mockEventEmitter = { emit: jest.fn() };
  const mockGeocodingService = { reverseGeocode: jest.fn() };
  const mockPropertyStatusService = {
    validateTransition: jest.fn(),
    canTransition: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: PropertyImagesService, useValue: mockPropertyImagesService },
        { provide: WhatsappService, useValue: mockWhatsappService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: GeocodingService, useValue: mockGeocodingService },
        { provide: PropertyStatusService, useValue: mockPropertyStatusService },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateBusinessTypeConfig (via create)', () => {
    it('RENT com saleTypes não-vazio lança InvalidBusinessTypeConfigError', async () => {
      const dto = baseDto({
        businessType: BusinessType.RENT,
        saleTypes: [SaleType.DIRECT],
        rentPrice: '2000.00',
        price: undefined,
      });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidBusinessTypeConfigError);
    });

    it('SALE sem saleTypes lança InvalidBusinessTypeConfigError', async () => {
      const dto = baseDto({ businessType: BusinessType.SALE, saleTypes: [] });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidBusinessTypeConfigError);
    });

    it('SALE sem price lança InvalidBusinessTypeConfigError', async () => {
      const dto = baseDto({ businessType: BusinessType.SALE, price: undefined });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidBusinessTypeConfigError);
    });

    it('RENT sem rentPrice lança InvalidBusinessTypeConfigError', async () => {
      const dto = baseDto({
        businessType: BusinessType.RENT,
        saleTypes: [],
        price: undefined,
        rentPrice: undefined,
      });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidBusinessTypeConfigError);
    });

    it('combinação válida não lança erro de negócio', async () => {
      mockPrismaService.property.create.mockResolvedValue({
        id: 'prop-1',
        neighborhoodId: 'n-1',
      });

      const dto = baseDto();

      await expect(service.create(dto, 'user-1')).resolves.toMatchObject({ id: 'prop-1' });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('property.saved', {
        neighborhoodId: 'n-1',
      });
    });
  });

  describe('validateSubtypeData (via create)', () => {
    it('tipo declarado sem o campo de subtipo correspondente lança InvalidSubtypeDataError', async () => {
      const dto = baseDto({ type: PropertyType.HOUSE, land: undefined });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('campo de subtipo errado enviado junto lança InvalidSubtypeDataError', async () => {
      // type é HOUSE, mas o dto ainda carrega o "land" herdado do baseDto —
      // dois campos de subtipo presentes ao mesmo tempo deve ser rejeitado.
      const dto = baseDto({
        type: PropertyType.HOUSE,
        house: {} as CreatePropertyDto['house'],
      });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });
  });

  describe('validateSuites (via create)', () => {
    it('suites maior que bathrooms lança InvalidSubtypeDataError', async () => {
      const dto = baseDto({ suites: 3, bathrooms: 2 });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('suites menor ou igual a bathrooms não lança erro', async () => {
      mockPrismaService.property.create.mockResolvedValue({
        id: 'prop-1',
        neighborhoodId: 'n-1',
      });

      // suites/bathrooms são rejeitados para LAND (validateLandFields), então este caso
      // usa HOUSE — tipo em que esses campos são permitidos — para exercitar só validateSuites.
      const dto = baseDto({
        type: PropertyType.HOUSE,
        land: undefined,
        house: { floors: 1, isInCondominium: false },
        suites: 1,
        bathrooms: 2,
      });

      await expect(service.create(dto, 'user-1')).resolves.toMatchObject({ id: 'prop-1' });
    });
  });

  describe('validateLandFields (via create)', () => {
    it('bedrooms enviado com type LAND lança InvalidSubtypeDataError', async () => {
      const dto = baseDto({ bedrooms: 3 });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('builtArea enviado com type LAND lança InvalidSubtypeDataError', async () => {
      const dto = baseDto({ builtArea: 500 });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('LAND sem nenhum desses campos, mas com totalArea, não lança erro', async () => {
      mockPrismaService.property.create.mockResolvedValue({
        id: 'prop-1',
        neighborhoodId: 'n-1',
      });

      const dto = baseDto();

      await expect(service.create(dto, 'user-1')).resolves.toMatchObject({ id: 'prop-1' });
    });

    it('LAND sem totalArea lança InvalidSubtypeDataError', async () => {
      const dto = baseDto({ totalArea: undefined });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });
  });

  describe('validateLandFields (via update)', () => {
    it('enviar bedrooms para uma propriedade LAND existente lança InvalidSubtypeDataError', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({
        type: PropertyType.LAND,
        businessType: BusinessType.SALE,
        saleTypes: [{ type: SaleType.DIRECT }],
        suites: null,
        bathrooms: null,
        bedrooms: null,
        parkingSpaces: null,
        builtArea: null,
        totalArea: 500,
        price: { toString: () => '100000.00' },
        rentPrice: null,
      });

      await expect(service.update('prop-1', { bedrooms: 2 } as UpdatePropertyDto)).rejects.toThrow(
        InvalidSubtypeDataError,
      );
    });

    it('mudar type para LAND sem reenviar bedrooms, mas com valor já salvo no banco, lança InvalidSubtypeDataError', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({
        type: PropertyType.HOUSE,
        businessType: BusinessType.SALE,
        saleTypes: [{ type: SaleType.DIRECT }],
        suites: null,
        bathrooms: null,
        bedrooms: 3,
        parkingSpaces: null,
        builtArea: null,
        totalArea: null,
        price: { toString: () => '100000.00' },
        rentPrice: null,
      });

      await expect(
        service.update('prop-1', { type: PropertyType.LAND } as UpdatePropertyDto),
      ).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('mudar type para LAND sem totalArea (nem enviado, nem já salvo) lança InvalidSubtypeDataError', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({
        type: PropertyType.HOUSE,
        businessType: BusinessType.SALE,
        saleTypes: [{ type: SaleType.DIRECT }],
        suites: null,
        bathrooms: null,
        bedrooms: null,
        parkingSpaces: null,
        builtArea: null,
        totalArea: null,
        price: { toString: () => '100000.00' },
        rentPrice: null,
      });

      await expect(
        service.update('prop-1', { type: PropertyType.LAND } as UpdatePropertyDto),
      ).rejects.toThrow(InvalidSubtypeDataError);
    });
  });

  describe('updateStatus — reativação inteligente INACTIVE → ACTIVE', () => {
    it('com imageCount > 0, resolve para ACTIVE', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ status: PropertyStatus.INACTIVE });
      mockPrismaService.propertyImage.count.mockResolvedValue(3);
      mockPropertyStatusService.validateTransition.mockReturnValue(undefined);
      mockPrismaService.property.update.mockResolvedValue({
        id: 'prop-1',
        status: PropertyStatus.ACTIVE,
      });

      await service.updateStatus('prop-1', PropertyStatus.ACTIVE);

      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: PropertyStatus.ACTIVE },
      });
    });

    it('com imageCount === 0, resolve para PENDING', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ status: PropertyStatus.INACTIVE });
      mockPrismaService.propertyImage.count.mockResolvedValue(0);
      mockPropertyStatusService.validateTransition.mockReturnValue(undefined);
      mockPrismaService.property.update.mockResolvedValue({
        id: 'prop-1',
        status: PropertyStatus.PENDING,
      });

      await service.updateStatus('prop-1', PropertyStatus.ACTIVE);

      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: PropertyStatus.PENDING },
      });
    });

    it('transições que não partem de INACTIVE→ACTIVE usam o status solicitado diretamente', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ status: PropertyStatus.PENDING });
      mockPropertyStatusService.validateTransition.mockReturnValue(undefined);
      mockPrismaService.property.update.mockResolvedValue({
        id: 'prop-1',
        status: PropertyStatus.ACTIVE,
      });

      await service.updateStatus('prop-1', PropertyStatus.ACTIVE);

      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: PropertyStatus.ACTIVE },
      });
    });
  });

  describe('findAll — filtragem de status por autenticação', () => {
    function whereUsed(): Record<string, unknown> {
      const call = mockPrismaService.property.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      return call[0].where;
    }

    beforeEach(() => {
      mockPrismaService.property.findMany.mockResolvedValue([]);
      mockPrismaService.property.count.mockResolvedValue(0);
    });

    it('chamada anônima sem ?status= é fixada em ACTIVE', async () => {
      await service.findAll({});

      expect(whereUsed()).toMatchObject({ deletedAt: null, status: PropertyStatus.ACTIVE });
    });

    it('chamada anônima não consegue ampliar o escopo via ?status=PENDING', async () => {
      await service.findAll({ status: PropertyStatus.PENDING });

      // O filtro pedido é descartado: inventário não publicado não pode vazar
      // pelo endpoint público de listagem.
      expect(whereUsed()).toMatchObject({ status: PropertyStatus.ACTIVE });
    });

    it('chamada anônima não consegue ampliar o escopo via ?status=INACTIVE', async () => {
      await service.findAll({ status: PropertyStatus.INACTIVE });

      expect(whereUsed()).toMatchObject({ status: PropertyStatus.ACTIVE });
    });

    it('chamada autenticada sem ?status= enxerga todos os status', async () => {
      await service.findAll({}, true);

      expect(whereUsed()).toEqual({ deletedAt: null });
      expect(whereUsed()).not.toHaveProperty('status');
    });

    it('chamada autenticada com ?status=PENDING usa o status pedido', async () => {
      await service.findAll({ status: PropertyStatus.PENDING }, true);

      expect(whereUsed()).toMatchObject({ status: PropertyStatus.PENDING });
    });

    it('ordena por preço com nulos no fim — imóvel só de aluguel não é "o mais barato"', async () => {
      await service.findAll({ sort: 'price_asc' });

      const call = mockPrismaService.property.findMany.mock.calls[0] as [{ orderBy: unknown }];
      expect(call[0].orderBy).toEqual({ price: { sort: 'asc', nulls: 'last' } });
    });

    it('ordena por área total decrescente', async () => {
      await service.findAll({ sort: 'area_desc' });

      const call = mockPrismaService.property.findMany.mock.calls[0] as [{ orderBy: unknown }];
      expect(call[0].orderBy).toEqual({ totalArea: { sort: 'desc', nulls: 'last' } });
    });

    it('sem sort cai em createdAt desc', async () => {
      await service.findAll({});

      const call = mockPrismaService.property.findMany.mock.calls[0] as [{ orderBy: unknown }];
      expect(call[0].orderBy).toEqual({ createdAt: 'desc' });
    });

    it('a busca textual cruza código e localização num OR', async () => {
      await service.findAll({ q: 'campolim' });

      const and = whereUsed().AND as { OR: unknown[] }[];
      expect(and).toHaveLength(1);
      expect(and[0].OR).toHaveLength(4);
    });

    it('a busca textual combina com um filtro explícito em vez de sobrescrevê-lo', async () => {
      // `q` mora num AND próprio justamente para isso: se fosse mesclado em
      // `where.neighborhood`, o filtro de cidade seria descartado.
      await service.findAll({ q: 'centro', city: 'Sorocaba' });

      const where = whereUsed();
      expect(where.neighborhood).toMatchObject({
        city: { contains: 'Sorocaba', mode: 'insensitive' },
      });
      expect(where.AND).toBeDefined();
    });

    it('q vazio ou só espaços não gera cláusula', async () => {
      await service.findAll({ q: '   ' });

      expect(whereUsed().AND).toBeUndefined();
    });

    it('soft delete continua excluído em qualquer escopo', async () => {
      await service.findAll({}, true);

      expect(whereUsed()).toMatchObject({ deletedAt: null });
    });
  });
});
