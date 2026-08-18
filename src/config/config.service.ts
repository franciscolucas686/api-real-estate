import { Injectable } from '@nestjs/common';
import { validateEnvConfig, type EnvConfig } from './env.config';

/**
 * Acesso tipado ao ambiente já validado.
 *
 * Só expõe o que alguém injeta. Os getters `config`, `nodeEnv`, `port`, `corsOrigin`,
 * `isDevelopment()` e `isTest()` existiam sem um único chamador — `main.ts` lê `PORT` e
 * `CORS_ORIGIN` direto do retorno de `validateEnvConfig()`, antes de o Nest existir, e
 * nada no app ramifica por ambiente além do `secure` do cookie. Um getter sem consumidor
 * é um convite a ramificar por `NODE_ENV` dentro do código, que é justamente o que a
 * seleção de ambiente por script (`dotenv-cli`) existe para evitar.
 */
@Injectable()
export class ConfigService {
  private envConfig: EnvConfig;

  constructor() {
    this.envConfig = validateEnvConfig();
  }

  get databaseUrl(): string | undefined {
    return this.envConfig.DATABASE_URL;
  }

  get jwtSecret(): string {
    return this.envConfig.JWT_SECRET;
  }

  get jwtRefreshSecret(): string {
    return this.envConfig.JWT_REFRESH_SECRET;
  }

  get cookieDomain(): string | undefined {
    return this.envConfig.COOKIE_DOMAIN;
  }

  get r2AccountId(): string | undefined {
    return this.envConfig.R2_ACCOUNT_ID;
  }

  get r2AccessKeyId(): string | undefined {
    return this.envConfig.R2_ACCESS_KEY_ID;
  }

  get r2SecretAccessKey(): string | undefined {
    return this.envConfig.R2_SECRET_ACCESS_KEY;
  }

  get r2BucketName(): string | undefined {
    return this.envConfig.R2_BUCKET_NAME;
  }

  get r2PublicBaseUrl(): string | undefined {
    return this.envConfig.R2_PUBLIC_BASE_URL;
  }

  get r2Endpoint(): string | undefined {
    return this.envConfig.R2_ENDPOINT;
  }

  /**
   * A URL pública da SPA, para onde o módulo `share` manda o visitante depois de entregar
   * as OG tags ao crawler.
   *
   * A precedência não é arbitrária. `CORS_ORIGIN` entra como fallback porque em produção
   * ele **é** o endereço do app (`https://francinegestoraimobiliaria.com`, no `[env]` do
   * fly.toml), o que evita criar uma segunda variável dizendo a mesma coisa — e duas
   * variáveis que precisam concordar acabam discordando. O `'*'` é descartado por não ser
   * um endereço para onde redirecionar; ele é valor aceito fora de produção.
   *
   * O último degrau é para desenvolvimento, onde `CORS_ORIGIN` vale `http://localhost:3000`
   * — a porta desta API, não a do Vite. Sem ele, o redirect voltaria para o backend.
   */
  get appPublicUrl(): string {
    const corsOrigin = this.envConfig.CORS_ORIGIN === '*' ? undefined : this.envConfig.CORS_ORIGIN;
    const url = this.envConfig.APP_PUBLIC_URL ?? corsOrigin ?? 'http://localhost:5173';
    // Barra final fora, como o `enableCors` de main.ts já faz — o caminho é concatenado
    // depois e `//properties/x` não é a mesma URL que `/properties/x`.
    return url.replace(/\/$/, '');
  }

  get adminSecret(): string {
    return this.envConfig.ADMIN_SECRET;
  }

  isProduction(): boolean {
    return this.envConfig.NODE_ENV === 'production';
  }
}
