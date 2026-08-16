import { Injectable, Logger } from '@nestjs/common';
import { PropertyImage, PropertyStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import pLimit from 'p-limit';
import sharp from 'sharp';
import {
  ImageNotBelongToPropertyError,
  ImageNotFoundError,
  InvalidImageFileError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import {
  BulkDeletePropertyImagesDto,
  ReorderPropertyImagesDto,
  UpdatePropertyImageDto,
} from './dto';

// Cada imagem só é processada uma vez (sem reaproveitamento), então o cache
// interno do sharp não traz benefício e só consome memória; e com a
// concorrência já controlada pelo limiter abaixo, deixar o libvips usar só
// 1 thread por imagem evita disputa de CPU entre imagens processadas em paralelo.
sharp.cache(false);
sharp.concurrency(1);

// 3, não 6: cada decodificação simultânea segura um bitmap cru na memória (~36MB
// para uma foto de 12MP), e o gargalo real do upload é a rede do corretor, não a
// CPU do servidor — dobrar a concorrência dobra o pico de memória sem ganho de
// tempo perceptível. É o número que mantém o processo dentro de 1GB quando dois
// uploads acontecem ao mesmo tempo.
const IMAGE_PROCESSING_CONCURRENCY = 3;

@Injectable()
export class PropertyImagesService {
  private readonly logger = new Logger(PropertyImagesService.name);
  private readonly limit = pLimit(IMAGE_PROCESSING_CONCURRENCY);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  async uploadImages(
    propertyId: string,
    files: Express.Multer.File[],
    roomId?: string,
  ): Promise<{
    images: PropertyImage[];
    total: number;
  }> {
    const lastImage = await this.prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { order: 'desc' },
    });
    const startOrder = (lastImage?.order ?? -1) + 1;

    // Comprimir TUDO antes de subir QUALQUER COISA. As duas etapas já estiveram
    // juntas num método só, e aí um arquivo inválido no meio do lote deixava lixo:
    // o `Promise.all` rejeitava, o `createMany` abaixo nunca rodava, e as fotos que
    // já haviam subido ficavam no bucket sem linha no banco — invisíveis, e
    // multiplicadas a cada nova tentativa do operador.
    //
    // Separando, a falha mais comum (arquivo que não é imagem) acontece antes do
    // primeiro PUT, e o lote passa a ser atômico sem precisar de transação.
    // O pico de memória não muda: o `limit` continua governando as decodificações
    // simultâneas, que é o que custa caro (~36MB de bitmap cru cada). O que se
    // acumula a mais são os buffers já comprimidos, ~300KB por foto.
    const compressed = await Promise.all(
      files.map((file) => this.limit(() => this.compressImage(file))),
    );

    const images = await Promise.all(
      compressed.map((buffer, index) =>
        this.uploadCompressedImage(propertyId, buffer, startOrder + index, roomId),
      ),
    );

    await this.prisma.propertyImage.createMany({ data: images });
    await this.activatePropertyIfPending(propertyId);

    return {
      images,
      total: images.length,
    };
  }

  async updateImage(
    propertyId: string,
    imageId: string,
    dto: Omit<UpdatePropertyImageDto, 'roomId'>,
  ): Promise<PropertyImage> {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new ImageNotFoundError(imageId);
    }

    if (image.propertyId !== propertyId) {
      throw new ImageNotBelongToPropertyError(imageId, propertyId);
    }

    return this.prisma.propertyImage.update({
      where: { id: imageId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
    });
  }

  async reorderImages(propertyId: string, dto: ReorderPropertyImagesDto): Promise<PropertyImage[]> {
    const imageIds = dto.items.map((item) => item.imageId);
    const images = await this.prisma.propertyImage.findMany({
      where: { id: { in: imageIds }, propertyId },
    });

    if (images.length !== imageIds.length) {
      throw new ImageNotBelongToPropertyError('uma ou mais imagens', propertyId);
    }

    const roomIds = [
      ...new Set(
        dto.items.map((item) => item.roomId).filter((id): id is string => typeof id === 'string'),
      ),
    ];

    if (roomIds.length > 0) {
      const rooms = await this.prisma.propertyRoom.findMany({
        where: { id: { in: roomIds }, propertyId },
      });

      if (rooms.length !== roomIds.length) {
        throw new ImageNotBelongToPropertyError('um ou mais comodos', propertyId);
      }
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.propertyImage.update({
          where: { id: item.imageId },
          data: {
            order: item.order,
            ...(item.roomId !== undefined && { roomId: item.roomId }),
          },
        }),
      ),
    );

    return this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
    });
  }

  async deleteImage(imageId: string, userId: string) {
    const image = await this.prisma.propertyImage.findUnique({
      where: { id: imageId },
    });

    if (!image) {
      throw new ImageNotFoundError(imageId);
    }

    await this.deleteImagesFromR2([image]);

    const deleted = await this.prisma.propertyImage.delete({
      where: { id: imageId },
    });

    await this.syncPropertyStatus(image.propertyId);

    return deleted;
  }

  async bulkDeleteImages(propertyId: string, dto: BulkDeletePropertyImagesDto): Promise<void> {
    const images = await this.prisma.propertyImage.findMany({
      where: { id: { in: dto.imageIds }, propertyId },
    });

    if (images.length !== dto.imageIds.length) {
      throw new ImageNotBelongToPropertyError('uma ou mais imagens', propertyId);
    }

    const keys = images.map((img) => this.r2.getObjectKeyFromUrl(img.url));

    await this.r2.deleteImages(keys);

    try {
      await this.prisma.propertyImage.deleteMany({
        where: { id: { in: dto.imageIds } },
      });
      await this.syncPropertyStatus(propertyId);
    } catch (error) {
      this.logger.error(
        `R2 deletado mas falha ao remover registros do banco para propertyId=${propertyId}:`,
        error,
      );
    }
  }

  async deleteImagesFromR2(images: PropertyImage[]) {
    const deletePromises = images.map((image) => this.deleteImageFromR2(image));
    await Promise.allSettled(deletePromises);
  }

  async deletePropertyImagesFromR2(propertyId: string): Promise<void> {
    try {
      await this.r2.deleteObjectsByPrefix(`${propertyId}/`);
    } catch (error) {
      this.logger.warn(`Erro ao deletar imagens do imóvel ${propertyId} do R2:`, error);
    }
  }

  async deleteAllPropertyImagesFromR2(propertyId: string): Promise<void> {
    await Promise.all([
      this.r2
        .deleteObjectsByPrefix(`${propertyId}/`)
        .catch((error) =>
          this.logger.warn(`Erro ao deletar imagens ativas do imóvel ${propertyId} do R2:`, error),
        ),
      this.r2
        .deleteObjectsByPrefix(`deleted/${propertyId}/`)
        .catch((error) =>
          this.logger.warn(
            `Erro ao deletar imagens deletadas do imóvel ${propertyId} do R2:`,
            error,
          ),
        ),
    ]);
  }

  async movePropertyImagesToDeleted(propertyId: string): Promise<void> {
    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId },
    });

    if (images.length === 0) return;

    await Promise.all(
      images.map((image) =>
        this.limit(async () => {
          try {
            const sourceKey = this.r2.getObjectKeyFromUrl(image.url);
            const fileName = sourceKey.slice(sourceKey.indexOf('/') + 1);
            const destKey = `deleted/${propertyId}/${fileName}`;
            const newUrl = await this.r2.moveObject(sourceKey, destKey);
            await this.prisma.propertyImage.update({
              where: { id: image.id },
              data: { url: newUrl },
            });
          } catch (error) {
            this.logger.warn(`Erro ao mover imagem ${image.id} para deleted:`, error);
          }
        }),
      ),
    );
  }

  async restorePropertyImages(propertyId: string): Promise<void> {
    const images = await this.prisma.propertyImage.findMany({
      where: { propertyId },
    });

    if (images.length === 0) return;

    await Promise.all(
      images.map((image) =>
        this.limit(async () => {
          try {
            const sourceKey = this.r2.getObjectKeyFromUrl(image.url);
            const fileName = sourceKey.slice(sourceKey.lastIndexOf('/') + 1);
            const destKey = `${propertyId}/${fileName}`;
            const newUrl = await this.r2.moveObject(sourceKey, destKey);
            await this.prisma.propertyImage.update({
              where: { id: image.id },
              data: { url: newUrl },
            });
          } catch (error) {
            this.logger.warn(`Erro ao restaurar imagem ${image.id}:`, error);
          }
        }),
      ),
    );
  }

  // Compressão sempre gera um buffer (nunca stream): o SDK do R2 só evita um PUT
  // de tamanho desconhecido usando multipart upload (@aws-sdk/lib-storage), e o
  // tamanho mínimo de uma parte multipart é 5MB — bem acima do que uma foto
  // comprimida (1920x1080, JPEG 80%) costuma pesar. Streamar aqui adicionaria uma
  // dependência e complexidade sem reduzir o pico de memória real.
  //
  // É a etapa que valida o arquivo de fato: o `fileFilter` do controller olha só o
  // mimetype declarado pelo cliente, enquanto aqui o libvips precisa realmente
  // decodificar os bytes. Um arquivo corrompido ou com extensão mentirosa morre
  // neste ponto — antes de qualquer escrita no R2.
  private async compressImage(file: Express.Multer.File): Promise<Buffer> {
    try {
      return await sharp(file.buffer)
        .rotate()
        .resize(1920, 1080, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (error) {
      // Sem isto o erro cru do sharp cai no ramo genérico do AllExceptionsFilter e
      // vira um 500 "Erro interno do servidor" — que não diz ao operador qual foto
      // recusou nem por quê.
      this.logger.warn(
        `Arquivo rejeitado pelo processamento de imagem: ${file.originalname}`,
        error,
      );
      throw new InvalidImageFileError(file.originalname);
    }
  }

  private async uploadCompressedImage(
    propertyId: string,
    compressedBuffer: Buffer,
    order: number,
    roomId?: string,
  ): Promise<PropertyImage> {
    const key = `${propertyId}/${randomUUID()}.jpg`;
    const url = await this.r2.uploadImage(compressedBuffer, key, 'image/jpeg');

    return {
      id: randomUUID(),
      propertyId,
      roomId: roomId ?? null,
      url,
      label: null,
      order,
      createdAt: new Date(),
    };
  }

  // Caminho de upload não precisa da checagem bidirecional de syncPropertyStatus:
  // como acabamos de inserir pelo menos 1 imagem, a contagem já é > 0 por
  // construção — só falta virar ACTIVE se ainda estava PENDING.
  private async activatePropertyIfPending(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { status: true },
    });

    if (property?.status === PropertyStatus.PENDING) {
      await this.prisma.property.update({
        where: { id: propertyId },
        data: { status: PropertyStatus.ACTIVE },
      });
    }
  }

  private async syncPropertyStatus(propertyId: string): Promise<void> {
    const [imageCount, property] = await Promise.all([
      this.prisma.propertyImage.count({ where: { propertyId } }),
      this.prisma.property.findUnique({ where: { id: propertyId }, select: { status: true } }),
    ]);

    if (!property) return;

    if (property.status === PropertyStatus.PENDING && imageCount > 0) {
      await this.prisma.property.update({
        where: { id: propertyId },
        data: { status: PropertyStatus.ACTIVE },
      });
    } else if (property.status === PropertyStatus.ACTIVE && imageCount === 0) {
      await this.prisma.property.update({
        where: { id: propertyId },
        data: { status: PropertyStatus.PENDING },
      });
    }
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
