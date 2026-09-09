import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { ApiHeader } from '@nestjs/swagger';
import { AuthController } from './auth.controller';

/**
 * O `/docs` é o contrato entre backend e frontend, e ele pedia `user-agent` no register —
 * marcado como obrigatório, num header que ninguém precisa preencher e que o cliente HTTP
 * manda sozinho. São duas portas para esse input voltar, e este arquivo fecha as duas.
 *
 * A **implícita**: `@nestjs/swagger` documenta todo parâmetro `@Headers('nome')` com
 * `required: true` cravado. É por isso que o handler lê o header por `@UserAgent()` — ver o
 * comentário em `decorators/user-agent.decorator.ts`.
 *
 * A **explícita**: `@ApiHeader` documenta um header por conta própria, independente da
 * assinatura do handler. É assim que `x-admin-secret` aparece na doc sem existir como
 * parâmetro (quem o lê é o `AdminSecretGuard`) — e é por isso que o `@ApiHeader` que o login
 * carregava para desmarcar o `required` teve de sair junto: sozinho, ele recolocava o input.
 */
describe('AuthController — parâmetros expostos no Swagger', () => {
  /**
   * A chave sob a qual `@ApiHeader` guarda os headers é descoberta, não escrita à mão: o
   * `DECORATORS` do `@nestjs/swagger` vive em `dist/constants`, que o `exports` do pacote não
   * expõe (só `.` e `./plugin`). Decorar uma classe-sonda e ler de volta a chave que apareceu
   * usa só API pública e não pode divergir da lib.
   */
  const apiHeadersMetadataKey = (() => {
    class Probe {
      @ApiHeader({ name: 'sonda' })
      handler() {}
    }

    const key = Reflect.getMetadataKeys(Probe.prototype.handler).find((candidate) => {
      const value: unknown = Reflect.getMetadata(candidate, Probe.prototype.handler);
      return Array.isArray(value) && value.some((entry) => entry?.name === 'sonda');
    });

    if (!key) throw new Error('Não foi possível descobrir a chave de metadados de @ApiHeader');
    return key as string;
  })();

  const headerParamKeys = (handler: 'register' | 'login') => {
    const routeArgs: Record<string, unknown> =
      Reflect.getMetadata(ROUTE_ARGS_METADATA, AuthController, handler) ?? {};

    return Object.keys(routeArgs).filter(
      (key) => Number(key.split(':')[0]) === RouteParamtypes.HEADERS,
    );
  };

  const declaredHeaderNames = (handler: 'register' | 'login'): string[] => {
    const headers: { name: string }[] =
      Reflect.getMetadata(apiHeadersMetadataKey, AuthController.prototype[handler]) ?? [];

    return headers.map((header) => header.name);
  };

  describe.each(['register', 'login'] as const)('POST /auth/%s', (handler) => {
    it('não declara nenhum @Headers(), que o swagger documentaria como obrigatório', () => {
      expect(headerParamKeys(handler)).toEqual([]);
    });

    it('não declara o user-agent via @ApiHeader', () => {
      expect(declaredHeaderNames(handler)).not.toContain('user-agent');
    });
  });

  /**
   * A asserção positiva. Sem ela as duas acima passariam por vacuidade no dia em que alguém
   * apagasse os `@ApiHeader` todos — inclusive o único header que a rota de fato exige.
   */
  it('o register continua documentando o x-admin-secret, que é exigido de verdade', () => {
    expect(declaredHeaderNames('register')).toContain('x-admin-secret');
  });
});
