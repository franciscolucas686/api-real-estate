import { PropertyStatus } from '@prisma/client';
import { InvalidStatusTransitionError } from '../common/errors';
import { PropertyStatusService } from './property-status.service';

describe('PropertyStatusService', () => {
  let service: PropertyStatusService;

  beforeEach(() => {
    service = new PropertyStatusService();
  });

  describe('canTransition', () => {
    it.each([
      [PropertyStatus.PENDING, PropertyStatus.ACTIVE, true],
      [PropertyStatus.PENDING, PropertyStatus.INACTIVE, true],
      [PropertyStatus.ACTIVE, PropertyStatus.INACTIVE, true],
      [PropertyStatus.ACTIVE, PropertyStatus.PENDING, true],
      [PropertyStatus.INACTIVE, PropertyStatus.PENDING, true],
      [PropertyStatus.INACTIVE, PropertyStatus.ACTIVE, true],
      [PropertyStatus.PENDING, PropertyStatus.PENDING, false],
      [PropertyStatus.ACTIVE, PropertyStatus.ACTIVE, false],
      [PropertyStatus.INACTIVE, PropertyStatus.INACTIVE, false],
    ])('de %s para %s deve retornar %s', (from, to, expected) => {
      expect(service.canTransition(from, to)).toBe(expected);
    });
  });

  describe('validateTransition', () => {
    it('não lança erro para transição permitida', () => {
      expect(() =>
        service.validateTransition(PropertyStatus.PENDING, PropertyStatus.ACTIVE),
      ).not.toThrow();
    });

    it('lança InvalidStatusTransitionError para transição para o mesmo estado', () => {
      expect(() =>
        service.validateTransition(PropertyStatus.PENDING, PropertyStatus.PENDING),
      ).toThrow(InvalidStatusTransitionError);
    });

    it('lança InvalidStatusTransitionError para transição não mapeada', () => {
      expect(() =>
        service.validateTransition(PropertyStatus.ACTIVE, PropertyStatus.ACTIVE),
      ).toThrow(InvalidStatusTransitionError);
    });
  });
});
