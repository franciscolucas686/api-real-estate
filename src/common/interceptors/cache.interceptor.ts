import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly logger = new Logger('CacheInterceptor');
  private readonly cleanupInterval = 60000;

  constructor() {
    setInterval(() => this.cleanExpiredCache(), this.cleanupInterval);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (request.method !== 'GET') {
      return next.handle();
    }

    if (request.query.nocache) {
      return next.handle();
    }

    const cacheKey = this.generateCacheKey(request);
    const cachedEntry = this.cache.get(cacheKey);

    if (cachedEntry && Date.now() - cachedEntry.timestamp < cachedEntry.ttl) {
      this.logger.debug(`Cache HIT para ${request.path}`);
      response.setHeader('X-Cache', 'HIT');
      return of(cachedEntry.data);
    }

    return next.handle().pipe(
      tap((data) => {
        const ttl =
          request.path.includes('/') && request.path.split('/').length > 2 ? 600000 : 300000;

        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now(),
          ttl,
        });

        response.setHeader('X-Cache', 'MISS');
        this.logger.debug(`Cache SET para ${request.path} (TTL: ${ttl}ms)`);
      }),
    );
  }

  private generateCacheKey(request: Request): string {
    const queryString = Object.keys(request.query)
      .sort()
      .map((key) => `${key}=${request.query[key]}`)
      .join('&');

    return `${request.method}:${request.path}${queryString ? `?${queryString}` : ''}`;
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Limpeza de cache: ${cleaned} entradas removidas`);
    }
  }

  public invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      this.logger.debug('Cache completamente limpo');
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }

    this.logger.debug(`Cache invalidado para padrão: ${pattern}`);
  }

  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
