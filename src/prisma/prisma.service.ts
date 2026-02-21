import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { validateEnvConfig } from '../config/env.config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const envConfig = validateEnvConfig();

    if (!envConfig.DATABASE_URL) {
      throw new Error('DATABASE_URL é obrigatória para inicializar o PrismaClient.');
    }

    const adapter = new PrismaPg({ connectionString: envConfig.DATABASE_URL });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
