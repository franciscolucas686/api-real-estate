import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import pLimit from 'p-limit';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyImagesService } from './property-images.service';

/**
 * Quantos imóveis têm as fotos apagadas do R2 em paralelo.
 *
 * Baixo de propósito: este job roda de madrugada, sem ninguém esperando, e o custo de
 * ser lento é zero — enquanto o custo de saturar o R2 com a transação aberta não é.
 */
const R2_CLEANUP_CONCURRENCY = 4;

@Injectable()
export class PropertyCleanupService {
  private readonly logger = new Logger(PropertyCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyImagesService: PropertyImagesService,
  ) {}

  // Identificador arbitrário fixo usado como chave do advisory lock do Postgres,
  // evitando execução concorrente do job em múltiplas instâncias da aplicação.
  private static readonly CLEANUP_LOCK_KEY = 727_001;

  @Cron('0 3 * * *')
  async hardDeleteExpiredProperties(): Promise<void> {
    // pg_try_advisory_xact_lock é escopado à transação e libera automaticamente
    // no commit/rollback, evitando o risco de lock/unlock em conexões diferentes
    // do pool (o que aconteceria com pg_try_advisory_lock fora de uma transação).
    await this.prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<[{ locked: boolean }]>`
          SELECT pg_try_advisory_xact_lock(${PropertyCleanupService.CLEANUP_LOCK_KEY}) AS locked
        `;

        if (!locked) {
          this.logger.log('Cleanup job já em execução em outra instância, pulando.');
          return;
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);

        const expiredProperties = await tx.property.findMany({
          where: { deletedAt: { not: null, lte: cutoff } },
          select: { id: true },
        });

        if (expiredProperties.length === 0) return;

        // Com limite de concorrência, não `Promise.all` solto: cada
        // `deleteAllPropertyImagesFromR2` dispara dois `deleteObjectsByPrefix`, e cada
        // um deles é um laço paginado de List + Delete no R2. Sem o limite, N imóveis
        // expirados no mesmo dia viram 2N laços simultâneos — com a transação aberta e
        // o advisory lock na mão o tempo todo. Na operação normal N é 0 ou 1; o limite
        // existe para o dia da limpeza acumulada, em que estourar o timeout de 5min da
        // transação reverteria o `deleteMany` com objetos já apagados no R2.
        const limit = pLimit(R2_CLEANUP_CONCURRENCY);
        await Promise.all(
          expiredProperties.map((p) =>
            limit(() => this.propertyImagesService.deleteAllPropertyImagesFromR2(p.id)),
          ),
        );

        const result = await tx.property.deleteMany({
          where: { id: { in: expiredProperties.map((p) => p.id) } },
        });

        this.logger.log(`Hard deleted ${result.count} expired properties (older than 30 days)`);
      },
      { timeout: 5 * 60 * 1000 },
    );
  }
}
