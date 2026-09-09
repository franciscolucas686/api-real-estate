import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Truncamento do rótulo. O User-Agent é texto arbitrário vindo do cliente e vai para uma
 * coluna sem limite (`Session.userAgent`, `String?`); 255 é folgado para qualquer navegador
 * real.
 */
const USER_AGENT_MAX_LENGTH = 255;

/**
 * O `user-agent` da requisição, truncado, ou `null` quando ausente.
 *
 * É rótulo de diagnóstico da sessão, não identidade — **nada depende dele**. A strategy de
 * refresh não o compara, o throttler não o lê e a coluna é nullable: trocar de navegador não
 * invalida sessão nenhuma, e uma chamada sem o header registra a sessão do mesmo jeito.
 *
 * **Existe para manter o header fora do `/docs`, e é por isso que não é um `@Headers()`.** O
 * `@nestjs/swagger` documenta todo parâmetro `@Headers('nome')` com `required: true` cravado
 * (`services/parameter-metadata-accessor.js`), e o `?` de `userAgent?: string` some na
 * compilação — o Swagger UI passava a pedir, no register, um header que ninguém precisa
 * preencher e que o cliente HTTP manda sozinho. `@ApiHeader({ required: false })` só desmarca
 * o obrigatório; o input continua na tela. Um parâmetro de `createParamDecorator` grava a
 * chave como `__customRouteArgs__:<index>`, que o `mapParamType` do accessor não reconhece
 * como número: vira `'placeholder'` e o `excludePredicate` o omite. Mesmo mecanismo que já
 * mantém `@CurrentUser()` fora da doc.
 *
 * Converter isto de volta para `@Headers('user-agent')` reintroduz o input.
 */
export const UserAgent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null =>
    extractUserAgent(ctx.switchToHttp().getRequest<Request>()),
);

/**
 * Exportada à parte porque a fábrica de `createParamDecorator` não é alcançável de fora do
 * decorator: testá-la exigiria uma requisição HTTP real, e as rotas que a usam têm teto de
 * 5/5min. Aqui a regra é uma função pura.
 */
export function extractUserAgent(request: Request): string | null {
  const userAgent = request.headers['user-agent'];

  if (!userAgent) return null;
  return userAgent.slice(0, USER_AGENT_MAX_LENGTH);
}
