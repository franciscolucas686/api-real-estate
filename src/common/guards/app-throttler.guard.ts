import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectThrottlerOptions, InjectThrottlerStorage, ThrottlerGuard } from '@nestjs/throttler';
// `import type` obrigatório: são interfaces citadas numa assinatura decorada, e o
// tsconfig roda com `isolatedModules` + `emitDecoratorMetadata` (TS1272).
import type { ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ConfigService } from '../../config/config.service';
import { TooManyRequestsError } from '../errors';

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  /**
   * Quem é o dono do balde de rate limit.
   *
   * O `getTracker` padrão devolve `req.ip` puro, e isso não identifica ninguém aqui:
   * o navegador nunca fala direto com esta app (o rewrite do vercel.json encaminha
   * `/api/*` server-side, e o Render tem o proxy dele na frente), então todo request
   * chegava com o mesmo IP e o mundo inteiro dividia um balde por rota. Na prática o
   * limite era um teto global — 2 ou 3 visitantes anônimos esgotavam os 10/5min de
   * `POST /auth/refresh` e derrubavam a sessão do operador junto.
   *
   * Autenticado é chaveado pelo próprio id, o que isola cada sessão de verdade;
   * anônimo cai no IP real, agora recuperado via `req.ips` graças ao `trust proxy`
   * configurado em `main.ts`.
   *
   * O cookie é lido e verificado à mão em vez de sair de `request.user` porque guards
   * globais (`APP_GUARD`) rodam **antes** dos guards de rota: quando este método
   * executa, `JwtGuard`/`OptionalJwtGuard` ainda não populou `request.user`. E é
   * `verify`, não `decode`, porque um `sub` forjável daria a qualquer um baldes
   * ilimitados — que é exatamente o abuso que o throttler existe para conter.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token = (req.cookies as Record<string, string> | undefined)?.accessToken;

    if (token) {
      try {
        const { sub } = this.jwtService.verify<{ sub?: string }>(token, {
          secret: this.configService.jwtSecret,
        });
        if (sub) return `user:${sub}`;
      } catch {
        // Ausente, expirado ou assinado com outro segredo — trata como anônimo.
        // Vale notar que em `POST /auth/refresh` este é o caminho esperado: o
        // access token está expirado justamente por isso a rota foi chamada.
      }
    }

    const forwarded = req.ips as string[] | undefined;
    return `ip:${forwarded?.length ? forwarded[0] : (req.ip as string)}`;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new TooManyRequestsError();
  }
}
