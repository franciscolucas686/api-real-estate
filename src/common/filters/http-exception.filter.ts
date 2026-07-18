import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainError } from '../errors/domain.error';

interface HttpExceptionResponseBody {
  statusCode?: number;
  message: string | string[];
  error?: string;
  code?: string;
}

interface ErrorResponse {
  statusCode: number;
  code: string;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: DomainError | HttpException | Error | unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errorType, code } = this.resolveException(exception, request);

    if (status >= 400 && status < 500) {
      this.logger.warn(
        `[${status}] ${request.method} ${request.path} - ${typeof message === 'string' ? message : message.join(', ')}`,
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      code,
      timestamp: new Date().toISOString(),
      path: request.path,
      method: request.method,
      message,
      error: errorType,
    };

    response.status(status).json(errorResponse);
  }

  private resolveException(
    exception: DomainError | HttpException | Error | unknown,
    request: Request,
  ): { status: number; message: string | string[]; errorType: string; code: string } {
    if (exception instanceof DomainError) {
      return {
        status: exception.statusCode,
        message: exception.message,
        errorType: exception.name,
        code: exception.code,
      };
    }

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as HttpExceptionResponseBody;
        return {
          status: exception.getStatus(),
          message: responseObj.message || 'Erro na requisição',
          errorType: responseObj.error || exception.name,
          code: responseObj.code || 'HTTP_EXCEPTION',
        };
      }
      return {
        status: exception.getStatus(),
        message: exceptionResponse as string,
        errorType: exception.name,
        code: 'HTTP_EXCEPTION',
      };
    }

    if (exception instanceof Error) {
      this.logger.error(
        `[${exception.name}] ${exception.message}`,
        exception.stack,
        `${request.method} ${request.path}`,
      );
    } else {
      this.logger.error(
        `Erro desconhecido: ${JSON.stringify(exception)}`,
        undefined,
        `${request.method} ${request.path}`,
      );
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno do servidor',
      errorType: 'InternalServerError',
      code: 'INTERNAL_ERROR',
    };
  }
}
