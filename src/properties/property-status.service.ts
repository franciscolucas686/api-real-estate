import { Injectable } from '@nestjs/common';
import { PropertyStatus } from '@prisma/client';
import { InvalidStatusTransitionError } from '../common/errors';

const ALLOWED_TRANSITIONS: Partial<Record<PropertyStatus, PropertyStatus[]>> = {
  [PropertyStatus.PENDING]: [PropertyStatus.ACTIVE, PropertyStatus.INACTIVE],
  [PropertyStatus.ACTIVE]: [PropertyStatus.INACTIVE, PropertyStatus.PENDING],
  [PropertyStatus.INACTIVE]: [PropertyStatus.PENDING, PropertyStatus.ACTIVE],
};

@Injectable()
export class PropertyStatusService {
  canTransition(from: PropertyStatus, to: PropertyStatus): boolean {
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    return allowed.includes(to);
  }

  validateTransition(from: PropertyStatus, to: PropertyStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStatusTransitionError(from, to);
    }
  }
}
