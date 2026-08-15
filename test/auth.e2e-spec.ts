import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { R2Service } from '../src/r2/r2.service';
import { createAppValidationPipe } from '../src/common/pipes/app-validation.pipe';

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
    app.useGlobalPipes(createAppValidationPipe());
    app.use(cookieParser());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/register cria um novo usuário e retorna cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('x-admin-secret', adminSecret)
      .send({ email, password, name: 'E2E Auth Test' })
      .expect(201);

    expect(res.body.user).toMatchObject({ email });
    expect(extractCookie(res.get('Set-Cookie'), 'accessToken')).toContain('accessToken=');
    expect(extractCookie(res.get('Set-Cookie'), 'refreshToken')).toContain('refreshToken=');
  });

  it('POST /auth/register com o mesmo email retorna 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('x-admin-secret', adminSecret)
      .send({ email, password, name: 'E2E Auth Test' })
      .expect(409);

    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('POST /auth/register com x-admin-secret errado retorna 403 ADMIN_SECRET_FORBIDDEN', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('x-admin-secret', 'wrong-secret')
      .send({ email: `other-${email}`, password, name: 'E2E Auth Test' })
      .expect(403);

    expect(res.body.code).toBe('ADMIN_SECRET_FORBIDDEN');
  });

  it('POST /auth/register com payload inválido retorna 400 VALIDATION_ERROR', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .set('x-admin-secret', adminSecret)
      .send({ email: 'not-an-email', password: '123', name: '' })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.message)).toBe(true);
  });

  it('POST /auth/login com credenciais corretas retorna cookies', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(res.body.user).toMatchObject({ email });
    expect(res.get('set-cookie')).toBeDefined();
  });

  it('POST /auth/login com credenciais erradas retorna 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /auth/me sem cookie retorna 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  // Nota: sem cookie, o passport-jwt falha a extração do token antes mesmo de
  // chamar JwtRefreshStrategy.validate() (nunca lança RefreshTokenMissingError
  // nesse caso) — cai no UnauthorizedException genérico do Nest, cujo `code`
  // é o fallback HTTP_EXCEPTION do filtro. Os 3 codes REFRESH_TOKEN_* reais
  // (missing/mismatch/expired) só são exercitados dentro de validate(), com
  // um refreshToken assinado válido — cobertos em jwt-refresh.strategy.spec.ts.
  it('POST /auth/refresh sem cookie retorna 401 HTTP_EXCEPTION (fallback)', async () => {
    const res = await request(app.getHttpServer()).post('/auth/refresh').expect(401);

    expect(res.body.code).toBe('HTTP_EXCEPTION');
  });

  it('fluxo completo: login → me → refresh → logout', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const loginAccessCookie = extractCookie(loginRes.get('Set-Cookie'), 'accessToken');
    const loginRefreshCookie = extractCookie(loginRes.get('Set-Cookie'), 'refreshToken');

    const meRes = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', [loginAccessCookie])
      .expect(200);
    expect(meRes.body).toMatchObject({ email });

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', [loginRefreshCookie])
      .expect(200);

    // Nota: o token pode ser idêntico ao anterior se emitido no mesmo segundo
    // (JWT com `iat` em segundos + payload igual => assinatura determinística).
    // O que importa aqui é que o endpoint aceita o refreshToken e emite um
    // accessToken válido, não necessariamente distinto byte-a-byte.
    const refreshedAccessCookie = extractCookie(refreshRes.get('Set-Cookie'), 'accessToken');
    expect(refreshedAccessCookie).toContain('accessToken=');

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', [refreshedAccessCookie])
      .expect(200);
  });
});
