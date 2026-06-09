import { Injectable } from '@nestjs/common';
import { PropertyStatus } from '@prisma/client';
import { InvalidStatusTransitionError } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_TRANSITIONS: Partial<Record<PropertyStatus, PropertyStatus[]>> = {
  [PropertyStatus.DRAFT]: [PropertyStatus.PENDING, PropertyStatus.INACTIVE],
  [PropertyStatus.PENDING]: [PropertyStatus.ACTIVE, PropertyStatus.INACTIVE, PropertyStatus.DRAFT],
  [PropertyStatus.ACTIVE]: [PropertyStatus.INACTIVE],
  [PropertyStatus.INACTIVE]: [PropertyStatus.PENDING],
};

@Injectable()
export class PropertyStatusService {
  constructor(private readonly prisma: PrismaService) {}

  meetsMinimumRequirements(imageCount: number): boolean {
    return imageCount >= 1;
  }

  getAutoStatus(currentStatus: PropertyStatus, imageCount: number): PropertyStatus {
    if (currentStatus === PropertyStatus.DRAFT && this.meetsMinimumRequirements(imageCount)) {
      return PropertyStatus.PENDING;
    }
    if (currentStatus === PropertyStatus.PENDING && !this.meetsMinimumRequirements(imageCount)) {
      return PropertyStatus.DRAFT;
    }
    return currentStatus;
  }

  canTransition(from: PropertyStatus, to: PropertyStatus): boolean {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  validateTransition(from: PropertyStatus, to: PropertyStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStatusTransitionError(from, to);
    }
  }

  async applyAutoStatus(propertyId: string): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { status: true, _count: { select: { images: true } } },
    });

    if (!property) return;

    const newStatus = this.getAutoStatus(property.status, property._count.images);
    if (newStatus === property.status) return;

    await this.prisma.property.update({
      where: { id: propertyId },
      data: { status: newStatus },
    });
  }
}
