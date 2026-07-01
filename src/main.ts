import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnvConfig } from './config/env.config';

const logger = new Logger('NestApplication');

async function bootstrap() {
  const envConfig = validateEnvConfig();

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: envConfig.CORS_ORIGIN === '*' ? true : envConfig.CORS_ORIGIN?.replace(/\/$/, ''),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('API Real Estate')
    .setDescription(
      'API para gerenciamento de propriedades imobiliárias com autenticação JWT, upload de imagens e filtros avançados.\n\n' +
        '## Autenticação\n' +
        'A maioria dos endpoints requer autenticação via cookie HTTP-only `accessToken` (obtido em `POST /api/auth/login`). ' +
        'O token expira em 15 minutos e é renovado automaticamente via `POST /api/auth/refresh` usando o cookie `refreshToken` (7 dias).\n\n' +
        '## Endpoints públicos\n' +
        '`GET /api/site-settings` não requer autenticação.',
    )
    .setVersion('1.0')
    .addCookieAuth('accessToken', { type: 'apiKey', in: 'cookie', name: 'accessToken' }, 'cookie')
    .addTag('Auth', 'Autenticação e autorização (login, logout, refresh, perfil)')
    .addTag('Properties', 'Gerenciamento de imóveis (CRUD, busca, filtros, status)')
    .addTag('whatsapp', 'Pool de números WhatsApp distribuídos automaticamente entre imóveis')
    .addTag(
      'site-settings',
      'Configurações globais do site (contato: WhatsApp, e-mail, telefone, horário)',
    )
    .addTag('Health', 'Verificação de saúde da API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = envConfig.PORT;
  await app.listen(port);
  logger.log(`Aplicação iniciada em http://localhost:${port}/api`);
  logger.log(`Documentação Swagger disponível em http://localhost:${port}/docs`);
}
bootstrap().catch((err) => {
  logger.error('Erro ao inicializar o app:', err);
  process.exit(1);
});
