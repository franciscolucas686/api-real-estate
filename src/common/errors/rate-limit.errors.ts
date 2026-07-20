import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class TooManyRequestsError extends DomainError {
  readonly statusCode = HttpStatus.TOO_MANY_REQUESTS;
  readonly code = 'TOO_MANY_REQUESTS';

  constructor() {
    super('Muitas Tentativas. Tente novamente em alguns minutos.');
  }
}
