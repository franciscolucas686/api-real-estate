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

/**
 * Codes estáveis para exceptions que o Nest levanta antes de qualquer código nosso
 * rodar, e que por isso não têm como carregar um `code` próprio.
 *
 * O caso concreto é o upload: o Multer rejeita arquivo acima do limite e o
 * `@nestjs/platform-express` traduz para `PayloadTooLargeException`, cuja mensagem
 * é o literal em inglês "File too large". Sem um code, `getErrorMessage` no
 * frontend cai no passthrough e mostra isso ao corretor. Com ele, a mensagem é
 * traduzida do lado do cliente como qualquer outro erro de domínio.
 */
const STATUS_CODES: Record<number, string> = {
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
};

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
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object') {
        const responseObj = exceptionResponse as HttpExceptionResponseBody;
        return {
          status,
          message: responseObj.message || 'Erro na requisição',
          errorType: responseObj.error || exception.name,
          code: responseObj.code || STATUS_CODES[status] || 'HTTP_EXCEPTION',
        };
      }
      return {
        status,
        message: exceptionResponse as string,
        errorType: exception.name,
        code: STATUS_CODES[status] || 'HTTP_EXCEPTION',
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
