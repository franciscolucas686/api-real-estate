import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Erro interno do servidor';
    let errorType = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as HttpExceptionResponseBody;
        message = responseObj.message || 'Erro na requisição';
        errorType = responseObj.error || exception.name;
      } else {
        message = exceptionResponse as string;
        errorType = exception.name;
      }
    } else if (exception instanceof Error) {
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

    if (status >= 400) {
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
}
