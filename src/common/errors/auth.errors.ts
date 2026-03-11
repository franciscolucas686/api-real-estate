import { DomainError } from './domain.error';

export class EmailAlreadyExistsError extends DomainError {
  constructor() {
    super('Email já cadastrado');
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('Email ou senha inválidos');
  }
}

export class UserNotFoundError extends DomainError {
  constructor() {
    super('Usuário não encontrado');
  }
}
