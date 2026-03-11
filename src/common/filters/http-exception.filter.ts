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
}

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  path: string;
  method: string;
  message: string | string[];
  error?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: DomainError | HttpException | Error | unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, errorType } = this.resolveException(exception, request);

    if (status >= 400 && status < 500) {
      this.logger.warn(
        `[${status}] ${request.method} ${request.path} - ${typeof message === 'string' ? message : message.join(', ')}`,
      );
    }

    const errorResponse: ErrorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.path,
      method: request.method,
      message,
    };

    if (status >= 500) {
      errorResponse.error = errorType;
    }

    response.status(status).json(errorResponse);
  }

  private resolveException(
    exception: DomainError | HttpException | Error | unknown,
    request: Request,
  ): { status: number; message: string | string[]; errorType: string } {
    if (exception instanceof DomainError) {
      return {
        status: exception.statusCode,
        message: exception.message,
        errorType: exception.name,
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
        };
      }
      return {
        status: exception.getStatus(),
        message: exceptionResponse as string,
        errorType: exception.name,
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
    };
  }
}
