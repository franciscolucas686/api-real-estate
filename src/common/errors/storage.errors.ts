import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class StorageNotConfiguredError extends DomainError {
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  readonly code = 'STORAGE_NOT_CONFIGURED';

  constructor() {
    super('Serviço de armazenamento não está configurado');
  }
}
