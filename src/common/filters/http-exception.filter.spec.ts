import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import { PropertyNotFoundError } from '../errors';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  const createHost = (): ArgumentsHost => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    const response = { status: statusMock };
    const request = { method: 'GET', path: '/test' };
    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('inclui code e error para um DomainError (4xx)', () => {
    const host = createHost();
    filter.catch(new PropertyNotFoundError('abc-123'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    const body = jsonMock.mock.calls[0][0];
    expect(body.code).toBe('PROPERTY_NOT_FOUND');
    expect(body.error).toBe('PropertyNotFoundError');
    expect(body.message).toBe('Propriedade com ID abc-123 não encontrada');
  });

  it('inclui code VALIDATION_ERROR quando o HttpException carrega code no body', () => {
    const host = createHost();
    filter.catch(
      new BadRequestException({
        message: ['campo inválido'],
        error: 'Bad Request',
        code: 'VALIDATION_ERROR',
      }),
      host,
    );

    const body = jsonMock.mock.calls[0][0];
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toEqual(['campo inválido']);
  });

  it('usa HTTP_EXCEPTION como fallback para HttpException nativo sem code', () => {
    const host = createHost();
    filter.catch(new NotFoundException('não encontrado'), host);

    const body = jsonMock.mock.calls[0][0];
    expect(body.code).toBe('HTTP_EXCEPTION');
    expect(body.statusCode).toBe(HttpStatus.NOT_FOUND);
  });

  it('usa INTERNAL_ERROR e mensagem genérica para erro não tratado (não vaza detalhes)', () => {
    const host = createHost();
    filter.catch(new Error('detalhe técnico sensível do banco'), host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = jsonMock.mock.calls[0][0];
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.message).toBe('Erro interno do servidor');
    expect(body.message).not.toContain('detalhe técnico');
  });
});
