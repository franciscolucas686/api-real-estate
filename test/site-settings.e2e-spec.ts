import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { R2Service } from '../src/r2/r2.service';
import { createAppValidationPipe } from '../src/common/pipes/app-validation.pipe';

/**
 * End-to-end coverage for `/site-settings`, and specifically for the `instagram` field's
 * format rule.
 *
 * The module had no tests at all until this field arrived, and the rule it introduces is the
 * kind that only a real request exercises: `@Matches` runs inside the global ValidationPipe,
 * so a service-level spec would never see it. Two halves matter and are easy to break apart:
 * the pattern must **reject** a handle written the way people actually paste it (`@handle`,
 * a full URL), and must **accept** the empty string — `@IsOptional()` only skips
 * `undefined`/`null`, so without the `^$` alternative in the regex there would be no way to
 * clear a handle once saved.
 *
 * The `phone` case is here for a third reason: `forbidNonWhitelisted` means dropping the
 * field from the DTO turns a stale client's payload into a 400 rather than a silent discard.
 * That is the deploy-ordering hazard, pinned so it stays a known cost and not a surprise.
 */
function extractCookie(setCookieHeader: string[] | undefined, name: string): string {
  const raw = (setCookieHeader ?? []).find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) throw new Error(`Cookie ${name} não encontrado na resposta`);
  return raw.split(';')[0];
}

describe('Site settings (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const email = `e2e-settings-${Date.now()}-${randomUUID()}@test.local`;
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

    await request(app.getHttpServer())
      .post('/auth/register')
      .set('x-admin-secret', adminSecret)
      .send({ name: 'E2E Settings', email, password });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    accessToken = extractCookie(login.headers['set-cookie'] as unknown as string[], 'accessToken');
  });

  afterAll(async () => {
    await app.close();
  });

  const patch = (body: unknown) =>
    request(app.getHttpServer()).patch('/site-settings').set('Cookie', accessToken).send(body);

  it('GET é público e devolve o bloco de contato com instagram', async () => {
    const res = await request(app.getHttpServer()).get('/site-settings').expect(200);

    expect(res.body).toHaveProperty('instagram');
    // A coluna saiu do banco; nada deve ressuscitá-la na resposta.
    expect(res.body).not.toHaveProperty('phone');
  });

  it('aceita um handle válido', async () => {
    const res = await patch({ instagram: 'francine.gestora_1' }).expect(200);
    expect(res.body.instagram).toBe('francine.gestora_1');
  });

  it('aceita string vazia, que é como o campo se limpa', async () => {
    const res = await patch({ instagram: '' }).expect(200);
    expect(res.body.instagram).toBe('');
  });

  it('recusa o handle com "@" — o armazenamento é sem prefixo', async () => {
    const res = await patch({ instagram: '@francinegestora' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('recusa uma URL completa — quem monta o link é o frontend', async () => {
    await patch({ instagram: 'https://instagram.com/francinegestora' }).expect(400);
  });

  it('recusa acima de 30 caracteres', async () => {
    await patch({ instagram: 'a'.repeat(31) }).expect(400);
  });

  it('recusa `phone`, que saiu do DTO — forbidNonWhitelisted não descarta em silêncio', async () => {
    const res = await patch({ phone: '1132104500' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH sem cookie continua 401', async () => {
    await request(app.getHttpServer())
      .patch('/site-settings')
      .send({ instagram: 'qualquer' })
      .expect(401);
  });
});
