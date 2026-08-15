import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnvConfig } from './config/env.config';
import { createAppValidationPipe } from './common/pipes/app-validation.pipe';

const logger = new Logger('NestApplication');

async function bootstrap() {
  const envConfig = validateEnvConfig();

  // Tipado como NestExpressApplication porque `app.set` (usado logo abaixo para o
  // `trust proxy`) é da instância do Express, não da interface genérica do Nest.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  // O app nunca recebe conexões diretas do navegador: em produção o rewrite de
  // `/api/*` no vercel.json do frontend encaminha para cá server-side (removendo o
  // `/api` no caminho, que existe só do lado do frontend), e a plataforma de deploy
  // ainda coloca o proxy dela na frente. Sem `trust proxy` o Express reporta em
  // `req.ip` o peer TCP imediato — o proxy — para *todo mundo*, e o throttler
  // (que chaveia por `req.ip`) colapsa a internet inteira num único balde por
  // rota. Com isto `req.ips` passa a carregar a cadeia do X-Forwarded-For, que é
  // o que `AppThrottlerGuard.getTracker` consome.
  app.set('trust proxy', 1);

  // Sem prefixo global: as rotas são servidas na raiz do host (`api.dominio.com/properties`).
  // O `/api` que ainda aparece no frontend é um caminho local dele, resolvido pelo rewrite do
  // `vercel.json` (e pelo proxy do Vite em dev) — nunca chega até aqui.

  app.useGlobalPipes(createAppValidationPipe());
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: envConfig.CORS_ORIGIN === '*' ? true : envConfig.CORS_ORIGIN?.replace(/\/$/, ''),
    credentials: true,
    // Sem o rewrite do Vercel no caminho, o navegador fala direto com a API e todo
    // POST/PATCH/DELETE com JSON dispara um preflight. O default do browser é cachear
    // a resposta por 5s, o que faz um OPTIONS extra acompanhar quase toda mutação;
    // 24h é o teto que o Chromium respeita (o Firefox corta em 24h também).
    maxAge: 86_400,
  });

  const config = new DocumentBuilder()
    .setTitle('API Real Estate')
    .setDescription(
      'API para gerenciamento de propriedades imobiliárias com autenticação JWT, upload de imagens e filtros avançados.\n\n' +
        '## Autenticação\n' +
        'A maioria dos endpoints requer autenticação via cookie HTTP-only `accessToken` (obtido em `POST /auth/login`). ' +
        'O token expira em 15 minutos e é renovado automaticamente via `POST /auth/refresh` usando o cookie `refreshToken` (7 dias).\n\n' +
        '## Endpoints públicos\n' +
        '`GET /site-settings` não requer autenticação.',
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
  logger.log(`Aplicação iniciada em http://localhost:${port}`);
  logger.log(`Documentação Swagger disponível em http://localhost:${port}/docs`);
}
bootstrap().catch((err) => {
  logger.error('Erro ao inicializar o app:', err);
  process.exit(1);
});
