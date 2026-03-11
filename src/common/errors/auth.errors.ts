import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class EmailAlreadyExistsError extends DomainError {
  readonly statusCode = HttpStatus.CONFLICT;

  constructor() {
    super('Email já cadastrado');
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly statusCode = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Email ou senha inválidos');
  }
}

export class UserNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('Usuário não encontrado');
  }
}
