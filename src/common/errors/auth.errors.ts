import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class EmailAlreadyExistsError extends DomainError {
  readonly statusCode = HttpStatus.CONFLICT;
  readonly code = 'EMAIL_ALREADY_EXISTS';

  constructor() {
    super('Email já cadastrado');
  }
}

export class InvalidCredentialsError extends DomainError {
  readonly statusCode = HttpStatus.UNAUTHORIZED;
  readonly code = 'INVALID_CREDENTIALS';

  constructor() {
    super('Email ou senha inválidos');
  }
}

export class UserNotFoundError extends DomainError {
  readonly statusCode = HttpStatus.UNAUTHORIZED;
  readonly code = 'USER_NOT_FOUND';

  constructor() {
    super('Usuário não encontrado');
  }
}

export class RefreshTokenMissingError extends DomainError {
  readonly statusCode = HttpStatus.UNAUTHORIZED;
  readonly code = 'REFRESH_TOKEN_MISSING';

  constructor() {
    super('Refresh token inválido');
  }
}

export class RefreshTokenMismatchError extends DomainError {
  readonly statusCode = HttpStatus.UNAUTHORIZED;
  readonly code = 'REFRESH_TOKEN_MISMATCH';

  constructor() {
    super('Refresh token não corresponde');
  }
}

export class RefreshTokenExpiredError extends DomainError {
  readonly statusCode = HttpStatus.UNAUTHORIZED;
  readonly code = 'REFRESH_TOKEN_EXPIRED';

  constructor() {
    super('Refresh token expirado');
  }
}

export class AdminSecretForbiddenError extends DomainError {
  readonly statusCode = HttpStatus.FORBIDDEN;
  readonly code = 'ADMIN_SECRET_FORBIDDEN';

  constructor() {
    super('Acesso não autorizado');
  }
}
