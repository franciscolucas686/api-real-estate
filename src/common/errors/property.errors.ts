import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class PropertyNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;
  readonly code = 'PROPERTY_NOT_FOUND';

  constructor(id: string) {
    super(`Propriedade com ID ${id} não encontrada`);
  }
}

export class ImageNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;
  readonly code = 'IMAGE_NOT_FOUND';

  constructor(id: string) {
    super(`Imagem com ID ${id} não encontrada`);
  }
}

export class ImageNotBelongToPropertyError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'IMAGE_NOT_BELONG_TO_PROPERTY';

  constructor(imageId: string, propertyId: string) {
    super(`Imagem com ID ${imageId} não pertence ao imóvel ${propertyId}`);
  }
}

export class RoomNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.NOT_FOUND;
  readonly code = 'ROOM_NOT_FOUND';

  constructor(id: string) {
    super(`Cômodo com ID ${id} não encontrado`);
  }
}

export class RoomNotBelongToPropertyError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'ROOM_NOT_BELONG_TO_PROPERTY';

  constructor(roomId: string, propertyId: string) {
    super(`Cômodo com ID ${roomId} não pertence ao imóvel ${propertyId}`);
  }
}

export class InvalidSubtypeDataError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'INVALID_SUBTYPE_DATA';

  constructor(message: string) {
    super(message);
  }
}

export class InvalidBusinessTypeConfigError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'INVALID_BUSINESS_TYPE_CONFIG';

  constructor(message: string) {
    super(message);
  }
}

export class PropertyNotDeletedError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'PROPERTY_NOT_DELETED';

  constructor(id: string) {
    super(`Propriedade com ID ${id} não está deletada`);
  }
}

export class PropertyForbiddenError extends DomainError {
  readonly statusCode = HttpStatus.FORBIDDEN;
  readonly code = 'PROPERTY_FORBIDDEN';

  constructor(id: string) {
    super(`Você não tem permissão para modificar a propriedade ${id}`);
  }
}

export class InvalidStatusTransitionError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'INVALID_STATUS_TRANSITION';

  constructor(from: string, to: string) {
    super(`Transição de status inválida: ${from} → ${to}`);
  }
}

export class RoomNameAlreadyExistsError extends DomainError {
  readonly statusCode = HttpStatus.CONFLICT;
  readonly code = 'ROOM_NAME_ALREADY_EXISTS';

  constructor(name: string) {
    super(`Já existe um cômodo com o nome "${name}" neste imóvel`);
  }
}

export class PropertyImageFileMissingError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'PROPERTY_IMAGE_FILE_MISSING';

  constructor() {
    super('Nenhuma imagem foi enviada');
  }
}
