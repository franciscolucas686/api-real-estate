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

  get corsOrigin(): string {
    return this.envConfig.CORS_ORIGIN;
  }

  get cloudinaryCloudName(): string {
    return this.envConfig.CLOUDINARY_CLOUD_NAME;
  }

  get cloudinaryApiKey(): string {
    return this.envConfig.CLOUDINARY_API_KEY;
  }

  get cloudinaryApiSecret(): string {
    return this.envConfig.CLOUDINARY_API_SECRET;
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
