import { DomainError } from './domain.error';

export class PropertyNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Propriedade com ID ${id} não encontrada`);
  }
}

export class ImageNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Imagem com ID ${id} não encontrada`);
  }
}

export class ImageNotBelongToPropertyError extends DomainError {
  constructor(imageId: string, propertyId: string) {
    super(`Imagem com ID ${imageId} não pertence ao imóvel ${propertyId}`);
  }
}

export class InvalidSubtypeDataError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}
