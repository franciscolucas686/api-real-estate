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

export class RoomNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;

  constructor(id: string) {
    super(`Cômodo com ID ${id} não encontrado`);
  }
}

export class RoomNotBelongToPropertyError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(roomId: string, propertyId: string) {
    super(`Cômodo com ID ${roomId} não pertence ao imóvel ${propertyId}`);
  }
}

export class InvalidSubtypeDataError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(message: string) {
    super(message);
  }
}

export class InvalidBusinessTypeConfigError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(message: string) {
    super(message);
  }
}

export class PropertyNotDeletedError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(id: string) {
    super(`Propriedade com ID ${id} não está deletada`);
  }
}

export class PropertyForbiddenError extends DomainError {
  readonly statusCode = HttpStatus.FORBIDDEN;

  constructor(id: string) {
    super(`Você não tem permissão para modificar a propriedade ${id}`);
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;

  constructor(from: string, to: string) {
    super(`Transição de status inválida: ${from} → ${to}`);
  }
}
