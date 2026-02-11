import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ThrottlerGuard } from '@nestjs/throttler';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalGuards(app.get(ThrottlerGuard));
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('API Real Estate')
    .setDescription(
      'API para gerenciamento de propriedades imobiliárias com autenticação JWT, upload de imagens e filtros avançados',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('accessToken')
    .addTag('Auth', 'Autenticação e autorização')
    .addTag('Properties', 'Gerenciamento de propriedades')
    .addTag('Health', 'Verificação de saúde')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = envConfig.PORT;
  await app.listen(port);
  logger.log(`Aplicação iniciada em http://localhost:${port}`);
  logger.log(`Documentação Swagger disponível em http://localhost:${port}/api/docs`);
}
bootstrap().catch((err) => {
  console.error('Erro ao inicializar o app:', err);
  process.exit(1);
});
