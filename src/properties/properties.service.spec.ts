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
    $transaction: jest.fn(),
  };

  const mockPropertyImagesService = {
    movePropertyImagesToDeleted: jest.fn(),
  };
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

    // A regra existia só no formulário do frontend, então qualquer chamada direta
    // à API passava por cima dela.
    it('SALE com condoFee maior que price lança InvalidBusinessTypeConfigError', async () => {
      const dto = baseDto({
        businessType: BusinessType.SALE,
        saleTypes: [SaleType.DIRECT],
        price: '250000.00',
        condoFee: '300000.00',
      });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidBusinessTypeConfigError);
    });

    it('RENT compara condoFee com rentPrice, não com price', async () => {
      mockPrismaService.property.create.mockResolvedValue({ id: 'prop-1', neighborhoodId: 'n-1' });

      // Maior que o rentPrice → rejeita.
      await expect(
        service.create(
          baseDto({
            businessType: BusinessType.RENT,
            saleTypes: [],
            price: undefined,
            rentPrice: '2000.00',
            condoFee: '2500.00',
          }),
          'user-1',
        ),
      ).rejects.toThrow(InvalidBusinessTypeConfigError);

      // Menor que o rentPrice → passa, mesmo sem price nenhum.
      await expect(
        service.create(
          baseDto({
            businessType: BusinessType.RENT,
            saleTypes: [],
            price: undefined,
            rentPrice: '2000.00',
            condoFee: '800.00',
          }),
          'user-1',
        ),
      ).resolves.toMatchObject({ id: 'prop-1' });
    });

    it('condoFee igual ao preço é aceito — a regra é "maior que"', async () => {
      mockPrismaService.property.create.mockResolvedValue({ id: 'prop-1', neighborhoodId: 'n-1' });

      const dto = baseDto({
        businessType: BusinessType.SALE,
        saleTypes: [SaleType.DIRECT],
        price: '250000.00',
        condoFee: '250000.00',
      });

      await expect(service.create(dto, 'user-1')).resolves.toMatchObject({ id: 'prop-1' });
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

  describe('validateApartmentAreaFields (via create)', () => {
    function apartmentDto(overrides: Partial<CreatePropertyDto> = {}): CreatePropertyDto {
      return baseDto({
        type: PropertyType.APARTMENT,
        land: undefined,
        apartment: {
          floor: 3,
          hasElevator: true,
          hasBalcony: true,
          sunPosition: 'MORNING' as never,
        },
        ...overrides,
      });
    }

    it('builtArea enviado com type APARTMENT lança InvalidSubtypeDataError', async () => {
      const dto = apartmentDto({ builtArea: 100 });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('APARTMENT sem totalArea lança InvalidSubtypeDataError', async () => {
      const dto = apartmentDto({ totalArea: undefined });

      await expect(service.create(dto, 'user-1')).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('APARTMENT com totalArea e sem builtArea não lança erro', async () => {
      mockPrismaService.property.create.mockResolvedValue({
        id: 'prop-1',
        neighborhoodId: 'n-1',
      });

      const dto = apartmentDto();

      await expect(service.create(dto, 'user-1')).resolves.toMatchObject({ id: 'prop-1' });
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

  /**
   * `null` explícito no corpo do PATCH significa "limpar", e a validação condicional
   * precisa enxergá-lo. Com `??` ela lia o valor antigo e aprovava — o `@IsOptional()`
   * do class-validator trata `null` como ausência, então o `null` atravessava a
   * validação de forma e era gravado assim mesmo.
   */
  describe('update — null explícito é o valor efetivo, não "não mexeu"', () => {
    function currentSaleProperty(overrides: Record<string, unknown> = {}) {
      return {
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
        condoFee: null,
        ...overrides,
      };
    }

    it('limpar o price de um imóvel SALE é recusado, não gravado em silêncio', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(currentSaleProperty());

      await expect(
        service.update('prop-1', { price: null } as unknown as UpdatePropertyDto),
      ).rejects.toThrow(InvalidBusinessTypeConfigError);
      expect(mockPrismaService.property.update).not.toHaveBeenCalled();
    });

    it('limpar o totalArea de um LAND é recusado', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(
        currentSaleProperty({ type: PropertyType.LAND, totalArea: 500 }),
      );

      await expect(
        service.update('prop-1', { totalArea: null } as unknown as UpdatePropertyDto),
      ).rejects.toThrow(InvalidSubtypeDataError);
    });

    // O outro lado da mesma conta: com `??`, limpar o condomínio era recusado por
    // causa do próprio valor que estava sendo removido.
    it('limpar o condoFee é aceito mesmo quando o valor antigo superaria o novo preço', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue(
        currentSaleProperty({ condoFee: { toString: () => '900.00' } }),
      );
      mockPrismaService.$transaction.mockResolvedValue({ neighborhoodId: 'n-1' });

      await expect(
        service.update('prop-1', {
          price: '500.00',
          condoFee: null,
        } as unknown as UpdatePropertyDto),
      ).resolves.toBeDefined();
    });
  });

  describe('validateApartmentAreaFields (via update)', () => {
    it('enviar builtArea para uma propriedade APARTMENT existente lança InvalidSubtypeDataError', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({
        type: PropertyType.APARTMENT,
        businessType: BusinessType.SALE,
        saleTypes: [{ type: SaleType.DIRECT }],
        suites: null,
        bathrooms: null,
        bedrooms: null,
        parkingSpaces: null,
        builtArea: null,
        totalArea: 80,
        price: { toString: () => '500000.00' },
        rentPrice: null,
      });

      await expect(
        service.update('prop-1', { builtArea: 70 } as UpdatePropertyDto),
      ).rejects.toThrow(InvalidSubtypeDataError);
    });

    it('mudar type para APARTMENT sem totalArea (nem enviado, nem já salvo) lança InvalidSubtypeDataError', async () => {
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
        price: { toString: () => '500000.00' },
        rentPrice: null,
      });

      await expect(
        service.update('prop-1', { type: PropertyType.APARTMENT } as UpdatePropertyDto),
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

  describe('remove — idempotência do soft delete', () => {
    it('deleta um imóvel ativo: move as imagens e grava deletedAt', async () => {
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1', deletedAt: null });
      mockPrismaService.property.update.mockResolvedValue({ id: 'prop-1', deletedAt: new Date() });

      await service.remove('prop-1');

      expect(mockPropertyImagesService.movePropertyImagesToDeleted).toHaveBeenCalledWith('prop-1');
      expect(mockPrismaService.property.update).toHaveBeenCalled();
    });

    // Repetir o DELETE movia as imagens de novo — sobre chaves que já estavam em
    // `deleted/`, produzindo `deleted/{id}/{id}/{uuid}.jpg` — e regravava o
    // `deletedAt`, reiniciando o prazo de 30 dias de retenção.
    it('deletar de novo não repete efeito nenhum', async () => {
      const jaDeletado = { id: 'prop-1', deletedAt: new Date('2026-01-01') };
      mockPrismaService.property.findUnique.mockResolvedValue(jaDeletado);

      const resultado = await service.remove('prop-1');

      expect(resultado).toBe(jaDeletado);
      expect(mockPropertyImagesService.movePropertyImagesToDeleted).not.toHaveBeenCalled();
      expect(mockPrismaService.property.update).not.toHaveBeenCalled();
    });
  });

  describe('findDeleted — a lixeira', () => {
    it('busca só o que tem deletedAt, do mais recente para o mais antigo', async () => {
      mockPrismaService.property.findMany.mockResolvedValue([]);
      mockPrismaService.property.count.mockResolvedValue(0);

      await service.findDeleted();

      const args = mockPrismaService.property.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ deletedAt: { not: null } });
      expect(args.orderBy).toEqual({ deletedAt: 'desc' });
    });

    // A listagem normal é auth-aware e atende anônimo; a lixeira é rota separada
    // justamente para não haver parâmetro capaz de ampliar o escopo por lá.
    it('devolve deletedAt no card, que é o que permite mostrar o prazo restante', async () => {
      const excluidoEm = new Date('2026-08-01');
      mockPrismaService.property.findMany.mockResolvedValue([
        {
          id: 'prop-1',
          code: '0001',
          type: 'LAND',
          businessType: 'SALE',
          status: 'PENDING',
          price: null,
          rentPrice: null,
          deletedAt: excluidoEm,
          createdAt: new Date('2026-07-01'),
          condoFee: null,
          neighborhood: { displayName: 'Centro', city: 'São Paulo', state: 'SP' },
          bedrooms: null,
          suites: null,
          bathrooms: null,
          parkingSpaces: null,
          totalArea: 500,
          builtArea: null,
          rooms: [],
          images: [],
        },
      ]);
      mockPrismaService.property.count.mockResolvedValue(1);

      const resultado = await service.findDeleted();

      expect(resultado.data[0].deletedAt).toBe(excluidoEm);
      expect(resultado.total).toBe(1);
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
