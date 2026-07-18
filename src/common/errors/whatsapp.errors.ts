import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class WhatsappNumberNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;
  readonly code = 'WHATSAPP_NUMBER_NOT_FOUND';

  constructor(id: string) {
    super(`Número de WhatsApp com ID ${id} não encontrado`);
  }
}
