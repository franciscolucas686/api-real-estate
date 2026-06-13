import { Injectable } from '@nestjs/common';
import { PropertyStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type StatusCounts = Record<PropertyStatus, number>;

const DEFAULT_COUNTS: StatusCounts = {
  [PropertyStatus.PENDING]: 0,
  [PropertyStatus.ACTIVE]: 0,
  [PropertyStatus.INACTIVE]: 0,
};

@Injectable()
export class PropertyStatusCountsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatusCounts(): Promise<StatusCounts> {
    const rows = await this.prisma.property.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    });

    return rows.reduce(
      (acc, row) => {
        acc[row.status] = row._count._all;
        return acc;
      },
      { ...DEFAULT_COUNTS },
    );
  }
}
