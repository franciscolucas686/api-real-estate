import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PropertyStatus } from '@prisma/client';
import { Observable, Subject, from, merge } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

export type StatusCounts = Record<PropertyStatus, number>;

const DEFAULT_COUNTS: StatusCounts = {
  [PropertyStatus.DRAFT]: 0,
  [PropertyStatus.PENDING]: 0,
  [PropertyStatus.ACTIVE]: 0,
  [PropertyStatus.INACTIVE]: 0,
};

@Injectable()
export class PropertyStatusCountsService implements OnModuleDestroy {
  private readonly changes$ = new Subject<void>();

  constructor(private readonly prisma: PrismaService) {}

  onModuleDestroy() {
    this.changes$.complete();
  }

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

  getStream(): Observable<MessageEvent> {
    const initial$ = from(
      this.getStatusCounts().then((counts) => ({ data: counts }) as MessageEvent),
    );

    const updates$ = this.changes$.pipe(
      switchMap(() =>
        from(this.getStatusCounts().then((counts) => ({ data: counts }) as MessageEvent)),
      ),
    );

    return merge(initial$, updates$);
  }

  @OnEvent('property.counts.changed')
  onCountsChanged() {
    this.changes$.next();
  }
}
