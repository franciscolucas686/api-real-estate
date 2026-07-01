import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { PropertyImagesService } from './property-images.service';

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

        await Promise.all(
          expiredProperties.map((p) =>
            this.propertyImagesService.deleteAllPropertyImagesFromR2(p.id),
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
