import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class PropertyNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;

  constructor(id: string) {
    super(`Propriedade com ID ${id} não encontrada`);
  }
}

export class ImageNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;

  constructor(id: string) {
    super(`Imagem com ID ${id} não encontrada`);
  }
}

export class ImageNotBelongToPropertyError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(imageId: string, propertyId: string) {
    super(`Imagem com ID ${imageId} não pertence ao imóvel ${propertyId}`);
  }
}

export class InvalidSubtypeDataError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(message: string) {
    super(message);
  }
}
