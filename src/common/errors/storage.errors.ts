import { DomainError } from './domain.error';

export class StorageNotConfiguredError extends DomainError {
  constructor() {
    super('Serviço de armazenamento não está configurado');
  }
}
