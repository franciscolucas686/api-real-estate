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
import { CreatePropertyDto } from './dto';
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

      const dto = baseDto({ suites: 1, bathrooms: 2 });

      await expect(service.create(dto, 'user-1')).resolves.toMatchObject({ id: 'prop-1' });
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
});
