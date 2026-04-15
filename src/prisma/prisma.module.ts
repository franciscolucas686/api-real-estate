import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';
import { PRISMA_DATABASE_URL, PrismaService } from './prisma.service';

@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: PRISMA_DATABASE_URL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const databaseUrl = configService.databaseUrl;
        if (!databaseUrl) {
          throw new Error('DATABASE_URL é obrigatória para inicializar o PrismaClient.');
        }
        return databaseUrl;
      },
    },
    PrismaService,
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
