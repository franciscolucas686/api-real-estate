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

  get adminSecret(): string {
    return this.envConfig.ADMIN_SECRET;
  }

  isProduction(): boolean {
    return this.envConfig.NODE_ENV === 'production';
  }
}
