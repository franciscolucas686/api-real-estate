import { HttpStatus } from '@nestjs/common';
import {
  AdminSecretForbiddenError,
  EmailAlreadyExistsError,
  GeocodingInvalidAddressError,
  GeocodingServiceError,
  ImageNotBelongToPropertyError,
  ImageNotFoundError,
  InvalidBusinessTypeConfigError,
  InvalidCredentialsError,
  InvalidStatusTransitionError,
  InvalidSubtypeDataError,
  PropertyForbiddenError,
  PropertyImageFileMissingError,
  PropertyNotDeletedError,
  PropertyNotFoundError,
  RefreshTokenExpiredError,
  RefreshTokenMismatchError,
  RefreshTokenMissingError,
  RoomNameAlreadyExistsError,
  RoomNotBelongToPropertyError,
  RoomNotFoundError,
  StorageNotConfiguredError,
  UserNotFoundError,
  WhatsappNumberNotFoundError,
} from './index';

describe('DomainError codes', () => {
  const cases: [string, { statusCode: HttpStatus; code: string }][] = [
    [
      'EmailAlreadyExistsError',
      new EmailAlreadyExistsError() as unknown as { statusCode: HttpStatus; code: string },
    ],
    ['InvalidCredentialsError', new InvalidCredentialsError()],
    ['UserNotFoundError', new UserNotFoundError()],
    ['RefreshTokenMissingError', new RefreshTokenMissingError()],
    ['RefreshTokenMismatchError', new RefreshTokenMismatchError()],
    ['RefreshTokenExpiredError', new RefreshTokenExpiredError()],
    ['AdminSecretForbiddenError', new AdminSecretForbiddenError()],
    ['PropertyNotFoundError', new PropertyNotFoundError('id')],
    ['ImageNotFoundError', new ImageNotFoundError('id')],
    ['ImageNotBelongToPropertyError', new ImageNotBelongToPropertyError('img', 'prop')],
    ['RoomNotFoundError', new RoomNotFoundError('id')],
    ['RoomNotBelongToPropertyError', new RoomNotBelongToPropertyError('room', 'prop')],
    ['InvalidSubtypeDataError', new InvalidSubtypeDataError('msg')],
    ['InvalidBusinessTypeConfigError', new InvalidBusinessTypeConfigError('msg')],
    ['PropertyNotDeletedError', new PropertyNotDeletedError('id')],
    ['PropertyForbiddenError', new PropertyForbiddenError('id')],
    ['InvalidStatusTransitionError', new InvalidStatusTransitionError('a', 'b')],
    ['RoomNameAlreadyExistsError', new RoomNameAlreadyExistsError('Sala')],
    ['PropertyImageFileMissingError', new PropertyImageFileMissingError()],
    ['StorageNotConfiguredError', new StorageNotConfiguredError()],
    ['WhatsappNumberNotFoundError', new WhatsappNumberNotFoundError('id')],
    ['GeocodingInvalidAddressError', new GeocodingInvalidAddressError('msg')],
    ['GeocodingServiceError', new GeocodingServiceError('msg')],
  ];

  const expected: Record<string, { statusCode: HttpStatus; code: string }> = {
    EmailAlreadyExistsError: { statusCode: HttpStatus.CONFLICT, code: 'EMAIL_ALREADY_EXISTS' },
    InvalidCredentialsError: { statusCode: HttpStatus.UNAUTHORIZED, code: 'INVALID_CREDENTIALS' },
    UserNotFoundError: { statusCode: HttpStatus.UNAUTHORIZED, code: 'USER_NOT_FOUND' },
    RefreshTokenMissingError: {
      statusCode: HttpStatus.UNAUTHORIZED,
      code: 'REFRESH_TOKEN_MISSING',
    },
    RefreshTokenMismatchError: {
      statusCode: HttpStatus.UNAUTHORIZED,
      code: 'REFRESH_TOKEN_MISMATCH',
    },
    RefreshTokenExpiredError: {
      statusCode: HttpStatus.UNAUTHORIZED,
      code: 'REFRESH_TOKEN_EXPIRED',
    },
    AdminSecretForbiddenError: {
      statusCode: HttpStatus.FORBIDDEN,
      code: 'ADMIN_SECRET_FORBIDDEN',
    },
    PropertyNotFoundError: { statusCode: HttpStatus.NOT_FOUND, code: 'PROPERTY_NOT_FOUND' },
    ImageNotFoundError: { statusCode: HttpStatus.NOT_FOUND, code: 'IMAGE_NOT_FOUND' },
    ImageNotBelongToPropertyError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'IMAGE_NOT_BELONG_TO_PROPERTY',
    },
    RoomNotFoundError: { statusCode: HttpStatus.NOT_FOUND, code: 'ROOM_NOT_FOUND' },
    RoomNotBelongToPropertyError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'ROOM_NOT_BELONG_TO_PROPERTY',
    },
    InvalidSubtypeDataError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'INVALID_SUBTYPE_DATA',
    },
    InvalidBusinessTypeConfigError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'INVALID_BUSINESS_TYPE_CONFIG',
    },
    PropertyNotDeletedError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'PROPERTY_NOT_DELETED',
    },
    PropertyForbiddenError: { statusCode: HttpStatus.FORBIDDEN, code: 'PROPERTY_FORBIDDEN' },
    InvalidStatusTransitionError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'INVALID_STATUS_TRANSITION',
    },
    RoomNameAlreadyExistsError: {
      statusCode: HttpStatus.CONFLICT,
      code: 'ROOM_NAME_ALREADY_EXISTS',
    },
    PropertyImageFileMissingError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'PROPERTY_IMAGE_FILE_MISSING',
    },
    StorageNotConfiguredError: {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'STORAGE_NOT_CONFIGURED',
    },
    WhatsappNumberNotFoundError: {
      statusCode: HttpStatus.NOT_FOUND,
      code: 'WHATSAPP_NUMBER_NOT_FOUND',
    },
    GeocodingInvalidAddressError: {
      statusCode: HttpStatus.BAD_REQUEST,
      code: 'GEOCODING_INVALID_ADDRESS',
    },
    GeocodingServiceError: {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'GEOCODING_SERVICE_ERROR',
    },
  };

  it.each(cases)('%s tem statusCode e code estáveis', (name, instance) => {
    expect(instance.statusCode).toBe(expected[name].statusCode);
    expect(instance.code).toBe(expected[name].code);
  });
});
