import { Test, TestingModule } from '@nestjs/testing';
import { PropertyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { PropertyImagesService } from './property-images.service';

jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    rotate: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-image')),
  }));
  Object.assign(mockSharp, { cache: jest.fn(), concurrency: jest.fn() });
  return mockSharp;
});

describe('PropertyImagesService', () => {
  let service: PropertyImagesService;

  const mockPrismaService = {
    propertyImage: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    property: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    propertyRoom: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockR2Service = {
    uploadImage: jest.fn(),
    deleteImage: jest.fn(),
    deleteImages: jest.fn(),
    deleteObjectsByPrefix: jest.fn(),
    getObjectKeyFromUrl: jest.fn(),
    moveObject: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertyImagesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: R2Service, useValue: mockR2Service },
      ],
    }).compile();

    service = module.get<PropertyImagesService>(PropertyImagesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncPropertyStatus (via deleteImage)', () => {
    it('PENDING com imageCount > 0 vira ACTIVE', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({
        id: 'img-1',
        propertyId: 'prop-1',
        url: 'https://bucket/prop-1/foo.jpg',
      });
      mockPrismaService.property.findUnique.mockResolvedValueOnce({
        status: PropertyStatus.PENDING,
      });
      mockPrismaService.propertyImage.delete.mockResolvedValue({ id: 'img-1' });
      mockPrismaService.propertyImage.count.mockResolvedValue(2);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1/foo.jpg');

      await service.deleteImage('img-1', 'user-1');

      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: PropertyStatus.ACTIVE },
      });
    });

    it('ACTIVE com imageCount === 0 volta a PENDING', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({
        id: 'img-1',
        propertyId: 'prop-1',
        url: 'https://bucket/prop-1/foo.jpg',
      });
      mockPrismaService.property.findUnique.mockResolvedValueOnce({
        status: PropertyStatus.ACTIVE,
      });
      mockPrismaService.propertyImage.delete.mockResolvedValue({ id: 'img-1' });
      mockPrismaService.propertyImage.count.mockResolvedValue(0);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1/foo.jpg');

      await service.deleteImage('img-1', 'user-1');

      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: PropertyStatus.PENDING },
      });
    });

    it('ACTIVE com imageCount ainda > 0 não altera o status', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({
        id: 'img-1',
        propertyId: 'prop-1',
        url: 'https://bucket/prop-1/foo.jpg',
      });
      mockPrismaService.property.findUnique.mockResolvedValueOnce({
        status: PropertyStatus.ACTIVE,
      });
      mockPrismaService.propertyImage.delete.mockResolvedValue({ id: 'img-1' });
      mockPrismaService.propertyImage.count.mockResolvedValue(3);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1/foo.jpg');

      await service.deleteImage('img-1', 'user-1');

      expect(mockPrismaService.property.update).not.toHaveBeenCalled();
    });

    it('INACTIVE nunca é alterado automaticamente, independente da contagem', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({
        id: 'img-1',
        propertyId: 'prop-1',
        url: 'https://bucket/prop-1/foo.jpg',
      });
      mockPrismaService.property.findUnique.mockResolvedValueOnce({
        status: PropertyStatus.INACTIVE,
      });
      mockPrismaService.propertyImage.delete.mockResolvedValue({ id: 'img-1' });
      mockPrismaService.propertyImage.count.mockResolvedValue(0);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1/foo.jpg');

      await service.deleteImage('img-1', 'user-1');

      expect(mockPrismaService.property.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadImages', () => {
    const makeFile = (name: string): Express.Multer.File =>
      ({ buffer: Buffer.from(name) }) as Express.Multer.File;

    it('processa todos os arquivos e insere tudo em um único createMany', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue({ order: 2 });
      mockR2Service.uploadImage
        .mockResolvedValueOnce('https://bucket/prop-1/a.jpg')
        .mockResolvedValueOnce('https://bucket/prop-1/b.jpg');
      mockPrismaService.propertyImage.createMany.mockResolvedValue({ count: 2 });
      mockPrismaService.property.findUnique.mockResolvedValue({
        status: PropertyStatus.ACTIVE,
      });

      const result = await service.uploadImages('prop-1', [makeFile('a'), makeFile('b')]);

      expect(mockPrismaService.propertyImage.createMany).toHaveBeenCalledTimes(1);
      const insertedData = mockPrismaService.propertyImage.createMany.mock.calls[0][0].data;
      expect(insertedData).toHaveLength(2);
      expect(insertedData.map((img: { order: number }) => img.order)).toEqual([3, 4]);
      expect(insertedData.every((img: { propertyId: string }) => img.propertyId === 'prop-1')).toBe(
        true,
      );
      expect(result.total).toBe(2);
      expect(result.images).toBe(insertedData);
    });

    it('ativa a propriedade se ela estava PENDING', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue(null);
      mockR2Service.uploadImage.mockResolvedValue('https://bucket/prop-1/a.jpg');
      mockPrismaService.propertyImage.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.property.findUnique.mockResolvedValue({
        status: PropertyStatus.PENDING,
      });

      await service.uploadImages('prop-1', [makeFile('a')]);

      expect(mockPrismaService.property.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: PropertyStatus.ACTIVE },
      });
    });

    it('não mexe no status se a propriedade já não estava PENDING', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue(null);
      mockR2Service.uploadImage.mockResolvedValue('https://bucket/prop-1/a.jpg');
      mockPrismaService.propertyImage.createMany.mockResolvedValue({ count: 1 });
      mockPrismaService.property.findUnique.mockResolvedValue({
        status: PropertyStatus.ACTIVE,
      });

      await service.uploadImages('prop-1', [makeFile('a')]);

      expect(mockPrismaService.property.update).not.toHaveBeenCalled();
    });
  });
});
