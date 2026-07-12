import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { R2Service } from '../src/r2/r2.service';

function extractCookie(setCookieHeader: string[] | undefined, name: string): string {
  const raw = (setCookieHeader ?? []).find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) throw new Error(`Cookie ${name} não encontrado na resposta`);
  return raw.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-auth-${Date.now()}-${randomUUID()}@test.local`;
  const password = 'Test@1234';
  const adminSecret = process.env.ADMIN_SECRET!;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(R2Service)
      .useValue({
        isConfigured: false,
        uploadImage: jest.fn(),
        deleteImage: jest.fn(),
        deleteImages: jest.fn(),
        deleteObjectsByPrefix: jest.fn(),
        getObjectKeyFromUrl: jest.fn(),
        moveObject: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/register cria um novo usuário e retorna cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('x-admin-secret', adminSecret)
      .send({ email, password, name: 'E2E Auth Test' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email });
    expect(extractCookie(res.get('set-cookie'), 'accessToken')).toContain('accessToken=');
    expect(extractCookie(res.get('set-cookie'), 'refreshToken')).toContain('refreshToken=');
  });

  it('POST /api/auth/register com o mesmo email retorna 409', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set('x-admin-secret', adminSecret)
      .send({ email, password, name: 'E2E Auth Test' })
      .expect(409);
  });

  it('POST /api/auth/login com credenciais corretas retorna cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.user).toMatchObject({ email });
    expect(res.get('set-cookie')).toBeDefined();
  });

  it('GET /api/auth/me sem cookie retorna 401', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('fluxo completo: login → me → refresh → logout', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const loginAccessCookie = extractCookie(loginRes.get('set-cookie'), 'accessToken');
    const loginRefreshCookie = extractCookie(loginRes.get('set-cookie'), 'refreshToken');

    const meRes = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', [loginAccessCookie])
      .expect(200);
    expect(meRes.body).toMatchObject({ email });

    const refreshRes = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Cookie', [loginRefreshCookie])
      .expect(200);

    // Nota: o token pode ser idêntico ao anterior se emitido no mesmo segundo
    // (JWT com `iat` em segundos + payload igual => assinatura determinística).
    // O que importa aqui é que o endpoint aceita o refreshToken e emite um
    // accessToken válido, não necessariamente distinto byte-a-byte.
    const refreshedAccessCookie = extractCookie(refreshRes.get('set-cookie'), 'accessToken');
    expect(refreshedAccessCookie).toContain('accessToken=');

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Cookie', [refreshedAccessCookie])
      .expect(200);
  });
});
