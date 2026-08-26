import { Test, TestingModule } from '@nestjs/testing';
import { PropertyStatus } from '@prisma/client';
import {
  ImageNotBelongToPropertyError,
  ImageNotFoundError,
  InvalidImageFileError,
  PropertyNotFoundError,
  RoomNotBelongToPropertyError,
} from '../common/errors';
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
      updateMany: jest.fn(),
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
      findUnique: jest.fn(),
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

      await service.deleteImage('prop-1', 'img-1');

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

      await service.deleteImage('prop-1', 'img-1');

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

      await service.deleteImage('prop-1', 'img-1');

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

      await service.deleteImage('prop-1', 'img-1');

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

    // A compressão e o upload já estiveram no mesmo método, um arquivo por vez. Um
    // arquivo inválido no meio do lote rejeitava o Promise.all, o createMany nunca
    // rodava, e as fotos que já haviam subido ficavam no bucket sem linha no banco.
    it('não sobe nada ao R2 quando um arquivo do lote não é imagem válida', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue(null);

      const sharpMock = jest.requireMock('sharp') as jest.Mock;
      sharpMock
        .mockReturnValueOnce({
          rotate: jest.fn().mockReturnThis(),
          resize: jest.fn().mockReturnThis(),
          jpeg: jest.fn().mockReturnThis(),
          toBuffer: jest.fn().mockResolvedValue(Buffer.from('ok')),
        })
        .mockReturnValueOnce({
          rotate: jest.fn().mockReturnThis(),
          resize: jest.fn().mockReturnThis(),
          jpeg: jest.fn().mockReturnThis(),
          toBuffer: jest
            .fn()
            .mockRejectedValue(new Error('Input buffer contains unsupported image format')),
        });

      await expect(
        service.uploadImages('prop-1', [makeFile('boa'), makeFile('pdf-disfarcado')]),
      ).rejects.toThrow(InvalidImageFileError);

      expect(mockR2Service.uploadImage).not.toHaveBeenCalled();
      expect(mockPrismaService.propertyImage.createMany).not.toHaveBeenCalled();
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

    // O destino era conferido só pelo `createMany`, ou seja, depois de todos os PUTs:
    // um propertyId inexistente virava violação de FK e deixava as fotos no bucket sem
    // linha no banco — invisíveis e sem rotina que as recolha.
    it('não sobe nada ao R2 quando a propriedade não existe', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue(null);
      mockPrismaService.property.findUnique.mockResolvedValue(null);

      await expect(service.uploadImages('prop-inexistente', [makeFile('a')])).rejects.toThrow(
        PropertyNotFoundError,
      );

      expect(mockR2Service.uploadImage).not.toHaveBeenCalled();
      expect(mockPrismaService.propertyImage.createMany).not.toHaveBeenCalled();
    });

    // O roomId vem do corpo, não da rota: a FK aceita o cômodo de outro imóvel porque
    // o id existe, e a foto passava a aparecer na galeria dos dois.
    it('recusa um roomId que pertence a outro imóvel, antes de subir', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue(null);
      mockPrismaService.property.findUnique.mockResolvedValue({ id: 'prop-1' });
      mockPrismaService.propertyRoom.findUnique.mockResolvedValue({ propertyId: 'prop-2' });

      await expect(
        service.uploadImages('prop-1', [makeFile('a')], 'room-de-outro'),
      ).rejects.toThrow(RoomNotBelongToPropertyError);

      expect(mockR2Service.uploadImage).not.toHaveBeenCalled();
      expect(mockPrismaService.propertyImage.createMany).not.toHaveBeenCalled();
    });

    // A pasta no R2 só ganha o sufixo do código quando não há foto anterior a
    // seguir — é o que garante que um imóvel novo já nasce com a pasta
    // identificável desde a primeira foto.
    it('usa "{propertyId}-{code}" como pasta quando o imóvel ainda não tem nenhuma foto', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue(null);
      mockPrismaService.property.findUnique.mockResolvedValue({
        id: 'prop-1',
        code: '654321',
        status: PropertyStatus.PENDING,
      });
      mockR2Service.uploadImage.mockResolvedValue('https://bucket/prop-1-654321/a.jpg');
      mockPrismaService.propertyImage.createMany.mockResolvedValue({ count: 1 });

      await service.uploadImages('prop-1', [makeFile('a')]);

      expect(mockR2Service.uploadImage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^prop-1-654321\/.+\.jpg$/),
        'image/jpeg',
      );
    });

    // Uma foto adicional a um imóvel que já tem fotos reaproveita a pasta que
    // essas fotos já usam — mesmo que o código do imóvel seja outro — para não
    // fragmentar a galeria entre duas pastas diferentes.
    it('reaproveita a pasta da última foto quando o imóvel já tem fotos', async () => {
      mockPrismaService.propertyImage.findFirst.mockResolvedValue({
        order: 2,
        url: 'https://bucket/prop-1-111111/existing.jpg',
      });
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1-111111/existing.jpg');
      mockPrismaService.property.findUnique.mockResolvedValue({
        id: 'prop-1',
        code: '999999',
        status: PropertyStatus.ACTIVE,
      });
      mockR2Service.uploadImage.mockResolvedValue('https://bucket/prop-1-111111/new.jpg');
      mockPrismaService.propertyImage.createMany.mockResolvedValue({ count: 1 });

      await service.uploadImages('prop-1', [makeFile('a')]);

      expect(mockR2Service.uploadImage).toHaveBeenCalledWith(
        expect.anything(),
        expect.stringMatching(/^prop-1-111111\/.+\.jpg$/),
        'image/jpeg',
      );
    });
  });

  describe('deleteImage — o propertyId da rota é conferido', () => {
    it('recusa apagar uma foto que pertence a outro imóvel, sem tocar no R2', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({
        id: 'img-1',
        propertyId: 'prop-2',
        url: 'https://bucket/prop-2/foo.jpg',
      });

      await expect(service.deleteImage('prop-1', 'img-1')).rejects.toThrow(
        ImageNotBelongToPropertyError,
      );

      expect(mockR2Service.deleteImage).not.toHaveBeenCalled();
      expect(mockPrismaService.propertyImage.delete).not.toHaveBeenCalled();
    });
  });

  describe('bulkDeleteImages', () => {
    // Engolir esta falha devolvia 204 com os objetos já apagados do R2 e as linhas
    // ainda no banco: a galeria sumia da tela e voltava quebrada no reload.
    it('propaga a falha do banco em vez de responder sucesso', async () => {
      mockPrismaService.propertyImage.findMany.mockResolvedValue([
        { id: 'img-1', propertyId: 'prop-1', url: 'https://bucket/prop-1/a.jpg' },
      ]);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1/a.jpg');
      mockR2Service.deleteImages.mockResolvedValue(undefined);
      mockPrismaService.propertyImage.deleteMany.mockRejectedValue(new Error('conexão perdida'));

      await expect(service.bulkDeleteImages('prop-1', { imageIds: ['img-1'] })).rejects.toThrow(
        'conexão perdida',
      );
    });
  });

  describe('setMainImage / unsetMainImage', () => {
    const image = { id: 'img-1', propertyId: 'prop-1', url: 'https://bucket/prop-1/a.jpg' };

    it('promove a escolhida e rebaixa as demais na mesma transação', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue(image);
      mockPrismaService.$transaction.mockResolvedValue([]);
      mockPrismaService.propertyImage.findMany.mockResolvedValue([]);

      await service.setMainImage('prop-1', 'img-1');

      // Uma transação só: nada pode observar o imóvel com duas principais nem com nenhuma.
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.propertyImage.updateMany).toHaveBeenCalledWith({
        where: { propertyId: 'prop-1', isMain: true },
        data: { isMain: false },
      });
      expect(mockPrismaService.propertyImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { isMain: true },
      });
    });

    // O rebaixamento em massa vem primeiro justamente para este caso: se a promoção viesse
    // antes, remarcar a atual principal a deixaria sem principal nenhuma.
    it('remarcar a foto que já é a principal a mantém principal', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({ ...image, isMain: true });
      mockPrismaService.$transaction.mockResolvedValue([]);
      mockPrismaService.propertyImage.findMany.mockResolvedValue([]);

      await service.setMainImage('prop-1', 'img-1');

      const updateManyOrder =
        mockPrismaService.propertyImage.updateMany.mock.invocationCallOrder[0];
      const updateOrder = mockPrismaService.propertyImage.update.mock.invocationCallOrder[0];
      expect(updateManyOrder).toBeLessThan(updateOrder);
    });

    it('desmarcar deixa o imóvel sem principal, com uma escrita só e sem transação', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({ ...image, isMain: true });
      mockPrismaService.propertyImage.update.mockResolvedValue({});
      mockPrismaService.propertyImage.findMany.mockResolvedValue([]);

      await service.unsetMainImage('prop-1', 'img-1');

      expect(mockPrismaService.propertyImage.update).toHaveBeenCalledWith({
        where: { id: 'img-1' },
        data: { isMain: false },
      });
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.propertyImage.updateMany).not.toHaveBeenCalled();
    });

    // Idempotente por construção: grava `false` onde já havia `false`. O frontend chama esta
    // rota a partir de um rascunho que pode estar desatualizado.
    it('desmarcar uma foto que não é a principal não quebra', async () => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({ ...image, isMain: false });
      mockPrismaService.propertyImage.update.mockResolvedValue({});
      mockPrismaService.propertyImage.findMany.mockResolvedValue([]);

      await expect(service.unsetMainImage('prop-1', 'img-1')).resolves.toBeDefined();
    });

    it.each([
      ['setMainImage', (s: PropertyImagesService) => s.setMainImage('prop-1', 'img-1')],
      ['unsetMainImage', (s: PropertyImagesService) => s.unsetMainImage('prop-1', 'img-1')],
    ])('%s recusa imagem de outro imóvel', async (_name, call) => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue({
        ...image,
        propertyId: 'outro-imovel',
      });

      await expect(call(service)).rejects.toThrow(ImageNotBelongToPropertyError);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.propertyImage.update).not.toHaveBeenCalled();
    });

    it.each([
      ['setMainImage', (s: PropertyImagesService) => s.setMainImage('prop-1', 'sumida')],
      ['unsetMainImage', (s: PropertyImagesService) => s.unsetMainImage('prop-1', 'sumida')],
    ])('%s recusa imagem inexistente', async (_name, call) => {
      mockPrismaService.propertyImage.findUnique.mockResolvedValue(null);

      await expect(call(service)).rejects.toThrow(ImageNotFoundError);
    });
  });

  describe('movePropertyImagesToDeleted', () => {
    // O destino é derivado da chave de origem, não reconstruído a partir do
    // propertyId sozinho — o que descartaria o sufixo do código de um imóvel
    // novo ao mover para a lixeira.
    it('preserva a pasta real (com sufixo de código) ao mover para deleted/', async () => {
      mockPrismaService.propertyImage.findMany.mockResolvedValue([
        { id: 'img-1', propertyId: 'prop-1', url: 'https://bucket/prop-1-654321/a.jpg' },
      ]);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1-654321/a.jpg');
      mockR2Service.moveObject.mockResolvedValue('https://bucket/deleted/prop-1-654321/a.jpg');
      mockPrismaService.propertyImage.update.mockResolvedValue({});

      await service.movePropertyImagesToDeleted('prop-1');

      expect(mockR2Service.moveObject).toHaveBeenCalledWith(
        'prop-1-654321/a.jpg',
        'deleted/prop-1-654321/a.jpg',
      );
    });

    it('continua funcionando para uma pasta antiga sem sufixo', async () => {
      mockPrismaService.propertyImage.findMany.mockResolvedValue([
        { id: 'img-1', propertyId: 'prop-1', url: 'https://bucket/prop-1/a.jpg' },
      ]);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('prop-1/a.jpg');
      mockR2Service.moveObject.mockResolvedValue('https://bucket/deleted/prop-1/a.jpg');
      mockPrismaService.propertyImage.update.mockResolvedValue({});

      await service.movePropertyImagesToDeleted('prop-1');

      expect(mockR2Service.moveObject).toHaveBeenCalledWith('prop-1/a.jpg', 'deleted/prop-1/a.jpg');
    });
  });

  describe('restorePropertyImages', () => {
    it('preserva a pasta real (com sufixo de código) ao restaurar', async () => {
      mockPrismaService.propertyImage.findMany.mockResolvedValue([
        { id: 'img-1', propertyId: 'prop-1', url: 'https://bucket/deleted/prop-1-654321/a.jpg' },
      ]);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('deleted/prop-1-654321/a.jpg');
      mockR2Service.moveObject.mockResolvedValue('https://bucket/prop-1-654321/a.jpg');
      mockPrismaService.propertyImage.update.mockResolvedValue({});

      await service.restorePropertyImages('prop-1');

      expect(mockR2Service.moveObject).toHaveBeenCalledWith(
        'deleted/prop-1-654321/a.jpg',
        'prop-1-654321/a.jpg',
      );
    });

    it('continua funcionando para uma pasta antiga sem sufixo', async () => {
      mockPrismaService.propertyImage.findMany.mockResolvedValue([
        { id: 'img-1', propertyId: 'prop-1', url: 'https://bucket/deleted/prop-1/a.jpg' },
      ]);
      mockR2Service.getObjectKeyFromUrl.mockReturnValue('deleted/prop-1/a.jpg');
      mockR2Service.moveObject.mockResolvedValue('https://bucket/prop-1/a.jpg');
      mockPrismaService.propertyImage.update.mockResolvedValue({});

      await service.restorePropertyImages('prop-1');

      expect(mockR2Service.moveObject).toHaveBeenCalledWith('deleted/prop-1/a.jpg', 'prop-1/a.jpg');
    });
  });

  describe('deleteAllPropertyImagesFromR2', () => {
    // Sem barra final: um propertyId (UUID de comprimento fixo) nunca é
    // prefixo de outro, e o prefixo sozinho casa tanto a pasta antiga
    // (`{propertyId}/...`) quanto a nova (`{propertyId}-{code}/...`) numa
    // chamada só, sem precisar saber qual das duas o imóvel usa.
    it('apaga por prefixo sem barra final, cobrindo pasta antiga e nova numa chamada só', async () => {
      mockR2Service.deleteObjectsByPrefix.mockResolvedValue(undefined);

      await service.deleteAllPropertyImagesFromR2('prop-1');

      expect(mockR2Service.deleteObjectsByPrefix).toHaveBeenCalledWith('prop-1');
      expect(mockR2Service.deleteObjectsByPrefix).toHaveBeenCalledWith('deleted/prop-1');
    });
  });
});
