import { HttpStatus } from '@nestjs/common';

export abstract class DomainError extends Error {
  abstract readonly statusCode: HttpStatus;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
