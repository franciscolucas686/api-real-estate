import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class StorageNotConfiguredError extends DomainError {
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

  constructor() {
    super('Serviço de armazenamento não está configurado');
  }
}
