import { Injectable, Logger } from '@nestjs/common';
import { PropertyImage, PropertyStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import pLimit from 'p-limit';
import sharp from 'sharp';
import {
  ImageNotBelongToPropertyError,
  ImageNotFoundError,
  InvalidImageFileError,
  PropertyNotFoundError,
  RoomNotBelongToPropertyError,
  RoomNotFoundError,
} from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { BulkDeletePropertyImagesDto, ReorderPropertyImagesDto } from './dto';

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
    // Destino conferido **antes** do primeiro PUT, no mesmo ida-e-volta do `order`.
    //
    // Sem isto o método subia tudo e só descobria o problema no `createMany`: um
    // `propertyId` inexistente virava violação de FK — 500 para o operador e fotos no
    // bucket sem linha no banco, invisíveis e sem rotina que as recolha, multiplicadas
    // a cada nova tentativa. É o mesmo vazamento que separar compressão de upload
    // fechou para arquivo inválido, entrando pela outra porta.
    //
    // O `roomId` é conferido junto porque ele vem do corpo, não da rota: um cômodo de
    // outro imóvel passava direto pela FK (o id existe) e anexava a foto à galeria
    // errada, onde ela aparece para os dois imóveis.
    const [lastImage, property, room] = await Promise.all([
      this.prisma.propertyImage.findFirst({
        where: { propertyId },
        orderBy: { order: 'desc' },
        select: { order: true, url: true },
      }),
      this.prisma.property.findUnique({
        where: { id: propertyId },
        select: { id: true, code: true },
      }),
      roomId
        ? this.prisma.propertyRoom.findUnique({
            where: { id: roomId },
            select: { propertyId: true },
          })
        : Promise.resolve(null),
    ]);

    if (!property) throw new PropertyNotFoundError(propertyId);
    if (roomId) {
      if (!room) throw new RoomNotFoundError(roomId);
      if (room.propertyId !== propertyId) {
        throw new RoomNotBelongToPropertyError(roomId, propertyId);
      }
    }

    const startOrder = (lastImage?.order ?? -1) + 1;

    // A pasta no R2 termina com o código do imóvel só quando não há foto
    // anterior a seguir — um imóvel sem nenhuma foto ainda (novo, ou com todas
    // já removidas) recebe `{propertyId}-{code}` desde a primeira; uma foto
    // adicional a um imóvel que já tem fotos reaproveita a pasta que essas
    // fotos já usam, para não fragmentar a galeria entre duas pastas. Isso
    // também cobre imóveis antigos (pasta `{propertyId}` sem sufixo) sem
    // precisar saber, aqui, se o imóvel é "antigo" ou "novo".
    const folder = lastImage
      ? this.r2.getObjectKeyFromUrl(lastImage.url).split('/')[0]
      : `${propertyId}-${property.code}`;

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
        this.uploadCompressedImage(propertyId, folder, buffer, startOrder + index, roomId),
      ),
    );

    await this.prisma.propertyImage.createMany({ data: images });
    await this.activatePropertyIfPending(propertyId);

    return {
      images,
      total: images.length,
    };
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

  /**
   * A foto principal do imóvel: a que abre o carrossel dos cards, da página de detalhes
   * e a capa do compartilhamento.
   *
   * Rebaixar a anterior e promover a nova acontece na mesma transação porque a
   * exclusividade não está no banco. Ela até caberia num índice único parcial
   * (`UNIQUE ("propertyId") WHERE "isMain"`), mas o Prisma não representa índices
   * parciais no schema, então ele viraria drift a cada `migrate dev` — o preço de
   * mantê-lo seria maior que o de concentrar a invariante aqui, que é o único caminho
   * de escrita da coluna.
   *
   * O `updateMany` vem primeiro para que remarcar a foto que já é a principal continue
   * funcionando: ela é rebaixada e promovida de novo, terminando marcada.
   */
  async setMainImage(propertyId: string, imageId: string): Promise<PropertyImage[]> {
    await this.ensureImageBelongsToProperty(propertyId, imageId);

    await this.prisma.$transaction([
      this.prisma.propertyImage.updateMany({
        where: { propertyId, isMain: true },
        data: { isMain: false },
      }),
      this.prisma.propertyImage.update({
        where: { id: imageId },
        data: { isMain: true },
      }),
    ]);

    return this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Devolve o imóvel ao estado sem foto principal — o mesmo de todo imóvel anterior a
   * esta coluna, que cada leitor já resolve pelo seu fallback. Por isso não há promoção
   * automática de uma substituta: "sem principal" é um estado válido, não um defeito.
   *
   * Uma escrita só, sem transação: desmarcar não tem invariante a preservar. E é
   * idempotente por construção — numa foto que não é a principal, grava `false` onde já
   * havia `false`.
   */
  async unsetMainImage(propertyId: string, imageId: string): Promise<PropertyImage[]> {
    await this.ensureImageBelongsToProperty(propertyId, imageId);

    await this.prisma.propertyImage.update({
      where: { id: imageId },
      data: { isMain: false },
    });

    return this.prisma.propertyImage.findMany({
      where: { propertyId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * A checagem que `deleteImage`, `setMainImage` e `unsetMainImage` compartilham: a foto
   * existe **e** é deste imóvel. Ver o comentário de `deleteImage` para o bug que a
   * segunda metade fecha.
   */
  private async ensureImageBelongsToProperty(
    propertyId: string,
    imageId: string,
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

    return image;
  }

  /**
   * O `propertyId` da rota é conferido, não ignorado.
   *
   * Ele chegava até aqui como um `userId` que o método nunca lia, então
   * `DELETE /properties/{qualquer-id}/images/{imageId}` apagava a foto de outro
   * imóvel — o `imageId` sozinho decidia tudo. Não é escalação de privilégio (esta
   * API é deliberadamente sem isolamento entre usuários autenticados), mas era a
   * única rota de foto que discordava de `bulkDeleteImages` e `reorderImages`, que
   * sempre conferiram: uma tela desatualizada apagava silenciosamente a foto errada.
   */
  async deleteImage(propertyId: string, imageId: string) {
    const image = await this.ensureImageBelongsToProperty(propertyId, imageId);

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

    // A falha do banco é registrada **e** propagada. Engoli-la devolvia 204 ao
    // cliente com os objetos já apagados do R2 e as linhas ainda no banco: a galeria
    // sumia da tela, e no próximo carregamento as fotos voltavam apontando para
    // arquivos que não existem mais. Um erro visível é pior de ver e melhor de ter —
    // o operador tenta de novo, e a segunda tentativa é inofensiva porque apagar do
    // R2 o que já não está lá não falha.
    try {
      await this.prisma.propertyImage.deleteMany({
        where: { id: { in: dto.imageIds } },
      });
    } catch (error) {
      this.logger.error(
        `R2 deletado mas falha ao remover registros do banco para propertyId=${propertyId}:`,
        error,
      );
      throw error;
    }

    await this.syncPropertyStatus(propertyId);
  }

  private async deleteImagesFromR2(images: PropertyImage[]) {
    const deletePromises = images.map((image) => this.deleteImageFromR2(image));
    await Promise.allSettled(deletePromises);
  }

  async deleteAllPropertyImagesFromR2(propertyId: string): Promise<void> {
    // Sem barra final de propósito: `Property.id` é sempre um UUID de
    // comprimento fixo, então nunca é prefixo de outro, e o prefixo sozinho
    // casa tanto a pasta antiga (`{propertyId}/...`) quanto a nova
    // (`{propertyId}-{code}/...`) numa chamada só — sem precisar saber, aqui,
    // qual das duas este imóvel usa.
    await Promise.all([
      this.r2
        .deleteObjectsByPrefix(propertyId)
        .catch((error) =>
          this.logger.warn(`Erro ao deletar imagens ativas do imóvel ${propertyId} do R2:`, error),
        ),
      this.r2
        .deleteObjectsByPrefix(`deleted/${propertyId}`)
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
            // Preserva a pasta real (`{propertyId}` ou `{propertyId}-{code}`)
            // em vez de reconstruí-la a partir de `propertyId` sozinho — o que
            // descartaria o sufixo do código de um imóvel novo ao mover para a
            // lixeira.
            const destKey = `deleted/${sourceKey}`;
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
            // Inverso de `movePropertyImagesToDeleted`: só remove o prefixo
            // `deleted/`, preservando a pasta real em vez de reconstruí-la a
            // partir de `propertyId` sozinho.
            const destKey = sourceKey.replace(/^deleted\//, '');
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
    folder: string,
    compressedBuffer: Buffer,
    order: number,
    roomId?: string,
  ): Promise<PropertyImage> {
    const key = `${folder}/${randomUUID()}.jpg`;
    const url = await this.r2.uploadImage(compressedBuffer, key, 'image/jpeg');

    return {
      id: randomUUID(),
      propertyId,
      roomId: roomId ?? null,
      url,
      label: null,
      order,
      // Foto nova nunca nasce principal: quem escolhe é o operador, por `setMainImage`.
      // Um upload que se autopromovesse trocaria a capa do imóvel a cada lote enviado.
      isMain: false,
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
