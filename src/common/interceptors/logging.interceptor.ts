import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method, path } = request;
    const correlationId = (request.headers['x-correlation-id'] as string) || randomUUID();
    const now = Date.now();

    response.setHeader('X-Correlation-ID', correlationId);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          this.logger.log(`[${correlationId}] ${method} ${path} - ${duration}ms`);
        },
        error: (error: Error) => {
          const duration = Date.now() - now;
          this.logger.error(
            `[${correlationId}] ${method} ${path} - ${duration}ms - ${error.name}: ${error.message}`,
          );
        },
      }),
    );
  }
}
