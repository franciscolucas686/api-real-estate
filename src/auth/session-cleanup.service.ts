import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SessionCleanupService {
  private readonly logger = new Logger(SessionCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Chave própria do advisory lock. 727_001 é do PropertyCleanupService — os dois jobs
  // são independentes e não devem se bloquear.
  private static readonly CLEANUP_LOCK_KEY = 727_002;

  /**
   * 04:00 para não disputar com o cleanup de imóveis, que roda às 03:00.
   *
   * Sem isto a tabela só cresce: uma sessão expirada nunca é lida de novo (a strategy
   * rejeita pelo `expiresAt`) e nada mais a remove — logout apaga só a linha de quem sai.
   */
  @Cron('0 4 * * *')
  async deleteExpiredSessions(): Promise<void> {
    // pg_try_advisory_xact_lock é escopado à transação e libera no commit/rollback,
    // evitando lock e unlock em conexões diferentes do pool.
    await this.prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(${SessionCleanupService.CLEANUP_LOCK_KEY}) AS locked
      `;

      if (!locked) {
        this.logger.log('Cleanup de sessões já em execução em outra instância, pulando.');
        return;
      }

      const { count } = await tx.session.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      if (count > 0) {
        this.logger.log(`Removidas ${count} sessões expiradas.`);
      }
    });
  }
}
