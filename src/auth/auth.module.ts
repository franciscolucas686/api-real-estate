import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfigModule } from '../config/config.module';
import { ConfigService } from '../config/config.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionCleanupService } from './session-cleanup.service';
import { SessionsService } from './sessions.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    AppConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwtSecret,
        signOptions: { expiresIn: '15m' },
      }),
    }),
    UsersModule,
    // PrismaModule não é @Global(): SessionsService fala com a tabela Session direto,
    // sem passar por UsersService, então a importação é necessária aqui.
    PrismaModule,
  ],
  providers: [AuthService, SessionsService, SessionCleanupService, JwtStrategy, JwtRefreshStrategy],
  controllers: [AuthController],
  // JwtModule sai daqui porque `AppThrottlerGuard` (registrado como APP_GUARD no
  // AppModule) verifica o cookie accessToken para chavear o rate limit por usuário.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
