import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappNumberNotFoundError } from '../common/errors';

const mockPrismaService = {
  whatsappNumber: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

describe('WhatsappService', () => {
  let service: WhatsappService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<WhatsappService>(WhatsappService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  describe('getWhatsappNumber', () => {
    it('deve retornar null quando não há números cadastrados', async () => {
      prisma.whatsappNumber.findMany.mockResolvedValue([]);

      const result = await service.getWhatsappNumber('test-property-id');

      expect(result).toBeNull();
    });

    it('deve retornar um número de WhatsApp quando há números cadastrados', async () => {
      const mockNumbers = [
        { id: '1', number: '15988193239', isActive: true, order: 0, createdAt: new Date() },
        { id: '2', number: '15988069764', isActive: true, order: 1, createdAt: new Date() },
      ];
      prisma.whatsappNumber.findMany.mockResolvedValue(mockNumbers);

      const result = await service.getWhatsappNumber('test-property-id');

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(mockNumbers.map((n) => n.number)).toContain(result);
    });

    it('deve retornar o mesmo número para o mesmo propertyId (determinismo)', async () => {
      const mockNumbers = [
        { id: '1', number: '15988193239', isActive: true, order: 0, createdAt: new Date() },
        { id: '2', number: '15988069764', isActive: true, order: 1, createdAt: new Date() },
      ];
      prisma.whatsappNumber.findMany.mockResolvedValue(mockNumbers);

      const result1 = await service.getWhatsappNumber('test-property-id');
      const result2 = await service.getWhatsappNumber('test-property-id');

      expect(result1).toBe(result2);
    });

    it('deve distribuir entre N números ativos', async () => {
      const mockNumbers = [
        { id: '1', number: '11111111111', isActive: true, order: 0, createdAt: new Date() },
        { id: '2', number: '22222222222', isActive: true, order: 1, createdAt: new Date() },
        { id: '3', number: '33333333333', isActive: true, order: 2, createdAt: new Date() },
      ];
      prisma.whatsappNumber.findMany.mockResolvedValue(mockNumbers);

      const results = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const number = await service.getWhatsappNumber(`property-${i}`);
        results.add(number!);
      }

      expect(results.size).toBeGreaterThan(1);
    });

    // Regressão: com `parseInt(md5, 16)` o valor era um double de ~2^127, portanto
    // sempre par, e `% 2` dava 0 para todo imóvel — o segundo número nunca recebia
    // nenhum. O teste acima não pegava porque usa 3 números, a única quantidade
    // pequena que escapava. Duas é o caso real.
    it('distribui de verdade com um número PAR de números ativos', async () => {
      const mockNumbers = [
        { id: '1', number: '11111111111', isActive: true, order: 0, createdAt: new Date() },
        { id: '2', number: '22222222222', isActive: true, order: 1, createdAt: new Date() },
      ];
      prisma.whatsappNumber.findMany.mockResolvedValue(mockNumbers);

      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        results.add((await service.getWhatsappNumber(`property-${i}`))!);
      }

      expect(results).toEqual(new Set(['11111111111', '22222222222']));
    });
  });

  describe('create', () => {
    it('deve criar um novo número de WhatsApp', async () => {
      const dto = { number: '11987654321' };
      const mockResult = {
        id: '1',
        ...dto,
        isActive: true,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.whatsappNumber.create.mockResolvedValue(mockResult);

      const result = await service.create(dto);

      expect(result).toEqual(mockResult);
      expect(prisma.whatsappNumber.create).toHaveBeenCalledWith({ data: dto });
    });
  });

  describe('findAll', () => {
    it('deve retornar todos os números de WhatsApp', async () => {
      const mockNumbers = [
        {
          id: '1',
          number: '11111111111',
          isActive: true,
          order: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          number: '22222222222',
          isActive: false,
          order: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      prisma.whatsappNumber.findMany.mockResolvedValue(mockNumbers);

      const result = await service.findAll();

      expect(result).toEqual(mockNumbers);
      expect(prisma.whatsappNumber.findMany).toHaveBeenCalledWith({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });
    });
  });

  describe('findOne', () => {
    it('deve retornar um número de WhatsApp por ID', async () => {
      const mockNumber = {
        id: '1',
        number: '11111111111',
        isActive: true,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.whatsappNumber.findUnique.mockResolvedValue(mockNumber);

      const result = await service.findOne('1');

      expect(result).toEqual(mockNumber);
    });

    it('deve lançar WhatsappNumberNotFoundError quando número não existe', async () => {
      prisma.whatsappNumber.findUnique.mockResolvedValue(null);

      await expect(service.findOne('999')).rejects.toThrow(WhatsappNumberNotFoundError);
    });
  });

  describe('update', () => {
    it('deve atualizar um número de WhatsApp', async () => {
      const mockNumber = {
        id: '1',
        number: '11111111111',
        isActive: true,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const updateDto = { order: 5 };
      prisma.whatsappNumber.findUnique.mockResolvedValue(mockNumber);
      prisma.whatsappNumber.update.mockResolvedValue({ ...mockNumber, ...updateDto });

      const result = await service.update('1', updateDto);

      expect(result.order).toBe(5);
      expect(prisma.whatsappNumber.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: updateDto,
      });
    });

    it('deve lançar WhatsappNumberNotFoundError quando número não existe', async () => {
      prisma.whatsappNumber.findUnique.mockResolvedValue(null);

      await expect(service.update('999', { order: 1 })).rejects.toThrow(
        WhatsappNumberNotFoundError,
      );
    });
  });

  describe('remove', () => {
    it('deve remover um número de WhatsApp', async () => {
      const mockNumber = {
        id: '1',
        number: '11111111111',
        isActive: true,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.whatsappNumber.findUnique.mockResolvedValue(mockNumber);
      prisma.whatsappNumber.delete.mockResolvedValue(mockNumber);

      await service.remove('1');

      expect(prisma.whatsappNumber.delete).toHaveBeenCalledWith({ where: { id: '1' } });
    });

    it('deve lançar WhatsappNumberNotFoundError quando número não existe', async () => {
      prisma.whatsappNumber.findUnique.mockResolvedValue(null);

      await expect(service.remove('999')).rejects.toThrow(WhatsappNumberNotFoundError);
    });
  });
});
