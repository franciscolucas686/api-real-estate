import { Injectable } from '@nestjs/common';
import { validateEnvConfig, type EnvConfig } from './env.config';

@Injectable()
export class ConfigService {
  private envConfig: EnvConfig;

  constructor() {
    this.envConfig = validateEnvConfig();
  }

  get config(): EnvConfig {
    return this.envConfig;
  }

  get nodeEnv(): string {
    return this.envConfig.NODE_ENV;
  }

  get port(): number {
    return this.envConfig.PORT;
  }

  get jwtSecret(): string {
    return this.envConfig.JWT_SECRET;
  }

  get jwtRefreshSecret(): string {
    return this.envConfig.JWT_REFRESH_SECRET;
  }

  get corsOrigin(): string | undefined {
    return this.envConfig.CORS_ORIGIN;
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

  get whatsappA(): string {
    return this.envConfig.WHATSAPP_A;
  }

  get whatsappB(): string {
    return this.envConfig.WHATSAPP_B;
  }

  isProduction(): boolean {
    return this.envConfig.NODE_ENV === 'production';
  }

  isDevelopment(): boolean {
    return this.envConfig.NODE_ENV === 'development';
  }

  isTest(): boolean {
    return this.envConfig.NODE_ENV === 'test';
  }
}
