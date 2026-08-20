import 'express';
import 'multer';

declare global {
  namespace Express {
    /**
     * O que as strategies do Passport põem em `request.user`.
     *
     * `sessionId` faltava aqui, e a divergência era invisível: `@CurrentUser()` vem de
     * `createParamDecorator`, que não restringe o tipo do parâmetro — o
     * `user: CurrentUserDto` escrito no controller passa por cima desta declaração.
     * `auth.controller.ts` lê `user.sessionId` no logout desde a migração para sessões,
     * então esta interface descrevia um objeto que não existe mais.
     *
     * `email` e `name` são opcionais porque as duas strategies devolvem coisas
     * diferentes, de propósito: `JwtStrategy` traz o perfil, enquanto
     * `JwtRefreshStrategy` devolve só `{ id, sessionId }` — o refresh não precisa do
     * perfil e evitar a consulta é o ponto.
     */
    interface Request {
      user?: {
        id: string;
        email?: string;
        name?: string | null;
        /** Vazio em access tokens emitidos antes da migração para sessões. */
        sessionId: string;
      };
    }
  }
}
