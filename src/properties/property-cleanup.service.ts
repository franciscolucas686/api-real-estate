import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PropertyCleanupService {
  private readonly logger = new Logger(PropertyCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 3 * * *')
  async hardDeleteExpiredProperties(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const result = await this.prisma.property.deleteMany({
      where: {
        deletedAt: {
          not: null,
          lte: cutoff,
        },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Hard deleted ${result.count} expired properties (older than 30 days)`);
    }
  }
}
