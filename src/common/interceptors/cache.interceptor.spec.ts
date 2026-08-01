import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { CACHE_KEY_META, CACHE_TTL_KEY } from '../decorators/cache.decorator';
import { CacheInterceptor } from './cache.interceptor';

/**
 * These specs exist because of a real vulnerability class: `GET /properties` is a
 * cached route behind `OptionalJwtGuard`, so the same URL yields different data for
 * anonymous and authenticated callers. Putting the guard in place is not enough — if
 * the cache key ignores auth state, one authenticated request poisons the cache and
 * every anonymous caller receives unpublished inventory for the rest of the TTL.
 */
describe('CacheInterceptor', () => {
  let interceptor: CacheInterceptor;
  let reflector: Reflector;

  const HANDLER = function findAll() {};

  function contextFor(options: {
    path?: string;
    query?: Record<string, string>;
    authenticated?: boolean;
    method?: string;
  }): ExecutionContext {
    const request = {
      method: options.method ?? 'GET',
      path: options.path ?? '/api/properties',
      query: options.query ?? {},
      user: options.authenticated ? { id: 'user-1', email: 'a@b.com' } : undefined,
    };
    const response = { setHeader: jest.fn() };

    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      getHandler: () => HANDLER,
    } as unknown as ExecutionContext;
  }

  function handlerReturning(value: unknown): CallHandler {
    return { handle: () => of(value) };
  }

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'get').mockImplementation((key: unknown) => {
      if (key === CACHE_TTL_KEY) return 300_000;
      if (key === CACHE_KEY_META) return 'properties-list';
      return undefined;
    });
    interceptor = new CacheInterceptor(reflector);
  });

  afterEach(() => {
    interceptor.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it('não serve a resposta de um caller autenticado para um caller anônimo', async () => {
    const privileged = [{ code: '1', status: 'PENDING' }];
    await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: true }), handlerReturning(privileged)),
    );

    const publicHandler = handlerReturning([{ code: '2', status: 'ACTIVE' }]);
    const jamSpy = jest.spyOn(publicHandler, 'handle');

    const result = await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), publicHandler),
    );

    // O handler anônimo precisa ter sido realmente executado — um cache HIT aqui
    // seria o vazamento.
    expect(jamSpy).toHaveBeenCalled();
    expect(result).not.toBe(privileged);
    expect(interceptor.getCacheStats().size).toBe(2);
  });

  it('não serve a resposta anônima para um caller autenticado', async () => {
    await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), handlerReturning(['anon'])),
    );

    const authHandler = handlerReturning(['auth']);
    const spy = jest.spyOn(authHandler, 'handle');

    const result = await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: true }), authHandler),
    );

    expect(spy).toHaveBeenCalled();
    expect(result).toEqual(['auth']);
  });

  it('reaproveita o cache quando escopo, rota e query são idênticos', async () => {
    await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), handlerReturning(['first'])),
    );

    const second = handlerReturning(['second']);
    const spy = jest.spyOn(second, 'handle');

    const result = await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), second),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual(['first']);
    expect(interceptor.getCacheStats().size).toBe(1);
  });

  it('separa entradas por query string, independentemente da ordem dos parâmetros', async () => {
    await firstValueFrom(
      interceptor.intercept(
        contextFor({ query: { city: 'Sorocaba', take: '10' } }),
        handlerReturning(['sorocaba']),
      ),
    );

    const reordered = handlerReturning(['ignored']);
    const spy = jest.spyOn(reordered, 'handle');

    const result = await firstValueFrom(
      interceptor.intercept(contextFor({ query: { take: '10', city: 'Sorocaba' } }), reordered),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual(['sorocaba']);

    const other = handlerReturning(['ibiuna']);
    await firstValueFrom(
      interceptor.intercept(contextFor({ query: { city: 'Ibiúna', take: '10' } }), other),
    );

    expect(interceptor.getCacheStats().size).toBe(2);
  });

  it('o escopo aparece na chave de cache', async () => {
    await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), handlerReturning([])),
    );
    await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: true }), handlerReturning([])),
    );

    const keys = interceptor.getCacheStats().keys;
    expect(keys).toContainEqual(expect.stringContaining('anon:'));
    expect(keys).toContainEqual(expect.stringContaining('auth:'));
  });

  it('não existe bypass de cache — nenhum query param fura', async () => {
    // O escape hatch `?nocache=1` foi removido: ele nunca chegou a funcionar (o
    // ValidationPipe rejeitava a requisição com 400 logo depois deste interceptor), e
    // expor um bypass público num endpoint cacheado justamente para manter tráfego
    // anônimo fora do banco é um vetor de carga.
    await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), handlerReturning(['cached'])),
    );

    const second = handlerReturning(['fresh']);
    const spy = jest.spyOn(second, 'handle');

    const result = await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), second),
    );

    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual(['cached']);
  });

  it('um `nocache` na query vira só mais uma chave, sem tratamento especial', async () => {
    await firstValueFrom(
      interceptor.intercept(contextFor({ authenticated: false }), handlerReturning(['sem'])),
    );

    const withParam = handlerReturning(['com']);
    const spy = jest.spyOn(withParam, 'handle');

    await firstValueFrom(interceptor.intercept(contextFor({ query: { nocache: '1' } }), withParam));

    // Executa porque a query string difere, não porque o param significa algo.
    expect(spy).toHaveBeenCalled();
    expect(interceptor.getCacheStats().size).toBe(2);
  });

  it('requisições não-GET não são cacheadas', async () => {
    await firstValueFrom(
      interceptor.intercept(contextFor({ method: 'POST' }), handlerReturning(['created'])),
    );

    expect(interceptor.getCacheStats().size).toBe(0);
  });
});
