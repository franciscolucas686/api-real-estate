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

  @Cron('0 3 * * *')
  async hardDeleteExpiredProperties(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const expiredProperties = await this.prisma.property.findMany({
      where: { deletedAt: { not: null, lte: cutoff } },
      select: { id: true },
    });

    if (expiredProperties.length === 0) return;

    await Promise.all(
      expiredProperties.map((p) => this.propertyImagesService.deleteAllPropertyImagesFromR2(p.id)),
    );

    const result = await this.prisma.property.deleteMany({
      where: { id: { in: expiredProperties.map((p) => p.id) } },
    });

    this.logger.log(`Hard deleted ${result.count} expired properties (older than 30 days)`);
  }
}
