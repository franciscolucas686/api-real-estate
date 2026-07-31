import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  OnModuleDestroy,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_KEY_META, CACHE_TTL_KEY, INVALIDATE_CACHE_KEY } from '../decorators/cache.decorator';

interface CacheEntry {
  data: unknown;
  timestamp: number;
  ttl: number;
}

const DEFAULT_TTL = 300_000;
const MAX_CACHE_SIZE = 500;
const CLEANUP_INTERVAL = 60_000;

@Injectable()
export class CacheInterceptor implements NestInterceptor, OnModuleDestroy {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly logger = new Logger('CacheInterceptor');
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(private readonly reflector: Reflector) {
    this.cleanupTimer = setInterval(() => this.cleanExpiredCache(), CLEANUP_INTERVAL);
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
    this.cache.clear();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const handler = context.getHandler();

    if (request.method !== 'GET') {
      return this.handleMutation(context, next);
    }

    const ttl = this.reflector.get<number>(CACHE_TTL_KEY, handler);

    if (ttl === undefined) {
      return next.handle();
    }

    if (request.query.nocache) {
      return next.handle();
    }

    if (request.query.nocache) {
      return next.handle();
    }

    const customKey = this.reflector.get<string>(CACHE_KEY_META, handler);
    const cacheKey = customKey
      ? this.generateKeyFromPrefix(customKey, request)
      : this.generateCacheKey(request);

    const cachedEntry = this.cache.get(cacheKey);

    if (cachedEntry && Date.now() - cachedEntry.timestamp < cachedEntry.ttl) {
      this.logger.debug(`Cache HIT para ${request.path}`);
      response.setHeader('X-Cache', 'HIT');
      return of(cachedEntry.data);
    }

    return next.handle().pipe(
      tap((data) => {
        this.evictIfNeeded();

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

  private handleMutation(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const patterns = this.reflector.get<string[]>(INVALIDATE_CACHE_KEY, handler);

    if (!patterns?.length) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        for (const pattern of patterns) {
          this.invalidateCache(pattern);
        }
      }),
    );
  }

  private generateKeyFromPrefix(prefix: string, request: Request): string {
    return `${prefix}:${this.requestSignature(request)}`;
  }

  private generateCacheKey(request: Request): string {
    return `${request.method}:${this.requestSignature(request)}`;
  }

  /**
   * Path + sorted query string + auth scope.
   *
   * The auth segment is not optional: routes behind `OptionalJwtGuard` return
   * different data for the same URL depending on whether a valid session cookie was
   * sent (e.g. `GET /properties` hides non-ACTIVE inventory from anonymous callers).
   * Without it, the first authenticated request would populate the cache and every
   * anonymous caller would be served that response for the rest of the TTL.
   *
   * Guards run before interceptors in Nest's request lifecycle, so `request.user` is
   * already populated here. Scope is the *fact* of authentication, not the user id —
   * this API is deliberately not data-isolated per user (see ARCHITECTURE.md), so a
   * per-user key would only fragment the cache without changing the response.
   */
  private requestSignature(request: Request): string {
    const queryString = Object.keys(request.query)
      .filter((key) => key !== 'nocache')
      .sort()
      .map((key) => `${key}=${String(request.query[key])}`)
      .join('&');

    const scope = request.user ? 'auth' : 'anon';

    return `${scope}:${request.path}${queryString ? `?${queryString}` : ''}`;
  }

  private evictIfNeeded(): void {
    if (this.cache.size < MAX_CACHE_SIZE) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.logger.debug(`Cache eviction: entrada mais antiga removida (${oldestKey})`);
    }
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

    let invalidated = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.logger.debug(`Cache invalidado para padrão "${pattern}": ${invalidated} entradas`);
    }
  }

  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}
