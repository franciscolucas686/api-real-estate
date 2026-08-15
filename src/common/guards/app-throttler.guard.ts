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
   * Sem `trust proxy` em `main.ts`, `req.ip` seria o peer TCP — o proxy da plataforma
   * de deploy — igual para todo mundo, e o mundo inteiro dividiria um balde por rota.
   * Na prática o limite virava um teto global: 2 ou 3 visitantes anônimos esgotavam os
   * 10/5min de `POST /auth/refresh` e derrubavam a sessão do operador junto.
   *
   * Autenticado é chaveado pelo próprio id, o que isola cada sessão de verdade;
   * anônimo cai no IP real da cadeia `X-Forwarded-For`.
   *
   * **`req.ips` não é a cadeia XFF inteira — é a cadeia já truncada pelo nível de
   * trust**, e é isso que torna o valor não-forjável. O `proxy-addr` corta em
   * `trust proxy = 1` hop, então sobra só a última entrada: a que o Fly de fato
   * observou. Um cliente que mande o próprio `X-Forwarded-For` empurra IPs para a
   * ponta esquerda, fora da janela confiável, e eles são descartados. Verificado com
   * `XFF: 1.2.3.4, 5.5.5.5, 9.9.9.9` → tracker `9.9.9.9`. Por construção
   * `req.ips[0] === req.ip` aqui; o `?:` abaixo cobre só o caso sem XFF nenhum.
   *
   * O acoplamento a vigiar é o **número** em `trust proxy`, que tem de igualar a
   * quantidade de proxies à frente. Hoje é 1 porque só o Fly está na frente. Pôr a
   * Cloudflare proxiada (nuvem laranja) em `api.` acrescenta um hop sem mudar este
   * arquivo: a janela confiável passaria a terminar no IP da borda da Cloudflare e
   * todos os visitantes voltariam a dividir um balde — o bug original, de volta pela
   * porta do DNS.
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
