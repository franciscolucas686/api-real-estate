import { HttpStatus } from '@nestjs/common';
import { DomainError } from './domain.error';

export class GeocodingInvalidAddressError extends DomainError {
  readonly statusCode = HttpStatus.BAD_REQUEST;
  readonly code = 'GEOCODING_INVALID_ADDRESS';

  constructor(message: string) {
    super(message);
  }
}

export class GeocodingServiceError extends DomainError {
  readonly statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
  readonly code = 'GEOCODING_SERVICE_ERROR';

  constructor(message: string) {
    super(message);
  }
}
