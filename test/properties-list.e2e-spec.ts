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
 * End-to-end coverage for `GET /properties`, mais a fronteira de dado privado de
 * `GET /properties/:id` (ver o último `describe`) — que precisa de duas requisições HTTP
 * reais em identidades diferentes, e por isso mora aqui e não num spec de serviço.
 *
 * This exists for one behaviour that **no unit test can reach**: the response cache.
 *
 * The endpoint is public-with-optional-auth and cached for 5 minutes. Pinning anonymous
 * callers to `status: ACTIVE` in the service is only half the fix — if the cache key ignores
 * auth state, the first authenticated request populates the cache and every anonymous caller
 * is served that privileged payload for the rest of the TTL. The service-level specs assert
 * the `where` clause and cannot observe that; only two real HTTP requests through the
 * interceptor can.
 */
function extractCookie(setCookieHeader: string[] | undefined, name: string): string {
  const raw = (setCookieHeader ?? []).find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) throw new Error(`Cookie ${name} não encontrado na resposta`);
  return raw.split(';')[0];
}

interface ListResponse {
  data: { id: string; status: string; price: string | null; totalArea: number | null }[];
  total: number;
}

describe('Properties list (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;

  const email = `e2e-list-${Date.now()}-${randomUUID()}@test.local`;
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
      .send({ name: 'E2E List', email, password });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    accessToken = extractCookie(login.headers['set-cookie'] as unknown as string[], 'accessToken');
  });

  afterAll(async () => {
    await app.close();
  });

  /*
   * Cases are isolated by giving each a distinct query string — the cache key includes the
   * sorted query, so a unique `take` is enough.
   *
   * There is deliberately no cache bypass to reach for. `CacheInterceptor` once honoured
   * `?nocache=1`, but that could never work end to end — the global ValidationPipe runs
   * immediately after the interceptor and `forbidNonWhitelisted` rejected the unknown param
   * with 400 — and exposing a public way to skip the cache on an endpoint cached precisely
   * to keep anonymous traffic off the database is a load vector. The bypass was removed.
   */
  const anon = (query: string) => request(app.getHttpServer()).get(`/properties?${query}`);
  const auth = (query: string) => anon(query).set('Cookie', accessToken);

  it('caller anônimo recebe apenas ACTIVE', async () => {
    const res = await anon('take=99').expect(200);
    const body = res.body as ListResponse;

    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((p) => p.status === 'ACTIVE')).toBe(true);
  });

  it('caller anônimo não consegue pedir PENDING — o filtro é descartado', async () => {
    const res = await anon('take=98&status=PENDING').expect(200);
    const body = res.body as ListResponse;

    expect(body.data.every((p) => p.status === 'ACTIVE')).toBe(true);
  });

  it('caller autenticado enxerga status não publicados', async () => {
    const res = await auth('take=97').expect(200);
    const body = res.body as ListResponse;

    // O seed de teste cobre ACTIVE/PENDING/INACTIVE, então o autenticado tem que ver mais
    // (ou pelo menos algo diferente de "só ACTIVE").
    expect(body.data.some((p) => p.status !== 'ACTIVE')).toBe(true);
  });

  it('a resposta de um autenticado NÃO é servida a um anônimo pelo cache', async () => {
    // Sem `nocache`, exercitando o cache de verdade — é isso que o guard sozinho não resolve.
    const path = '/properties?take=100';

    const authed = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', accessToken)
      .expect(200);
    expect((authed.body as ListResponse).data.some((p) => p.status !== 'ACTIVE')).toBe(true);

    const anonymous = await request(app.getHttpServer()).get(path).expect(200);
    expect((anonymous.body as ListResponse).data.every((p) => p.status === 'ACTIVE')).toBe(true);
  });

  it('e o inverso também: a resposta anônima não vaza para o autenticado', async () => {
    const path = '/properties?take=100&skip=0';

    const anonymous = await request(app.getHttpServer()).get(path).expect(200);
    expect((anonymous.body as ListResponse).data.every((p) => p.status === 'ACTIVE')).toBe(true);

    const authed = await request(app.getHttpServer())
      .get(path)
      .set('Cookie', accessToken)
      .expect(200);
    expect((authed.body as ListResponse).data.some((p) => p.status !== 'ACTIVE')).toBe(true);
  });

  it('o card traz os campos novos', async () => {
    const res = await anon('take=2').expect(200);
    const [card] = (res.body as ListResponse).data;

    // Aditivos na PR 15 — `suites` já era selecionado e descartado antes.
    expect(card).toHaveProperty('suites');
    expect(card).toHaveProperty('totalArea');
    expect(card).toHaveProperty('builtArea');
    expect(card).toHaveProperty('condoFee');
    expect(card).toHaveProperty('createdAt');
  });

  it('ordena por preço com nulos no fim', async () => {
    const res = await anon('take=96&sort=price_asc').expect(200);
    const prices = (res.body as ListResponse).data.map((p) => p.price);

    const firstNull = prices.indexOf(null);
    if (firstNull !== -1) {
      // Nenhum preço depois do primeiro nulo: aluguéis não podem abrir a lista de
      // "menor preço" só porque `price` é nulo.
      expect(prices.slice(firstNull).every((p) => p === null)).toBe(true);
    }

    const numeric = prices.filter((p): p is string => p !== null).map(Number);
    expect([...numeric].sort((a, b) => a - b)).toEqual(numeric);
  });

  it('a busca textual casa com bairro ou cidade', async () => {
    const all = await anon('take=95').expect(200);
    const sample = (all.body as ListResponse).data[0];
    expect(sample).toBeDefined();

    const detail = await request(app.getHttpServer()).get(`/properties/${sample.id}`).expect(200);
    const city = (detail.body as { city: string }).city;

    const res = await anon(`take=94&q=${encodeURIComponent(city)}`).expect(200);
    expect((res.body as ListResponse).total).toBeGreaterThan(0);
  });

  it('rejeita query param desconhecido com 400 — forbidNonWhitelisted', async () => {
    // O motivo pelo qual o backend precisa ir para produção antes do frontend.
    await anon('inventado=1').expect(400);
  });
  /**
   * O contato do proprietário é privado, e a proteção tem de ser do **backend**.
   *
   * `properties.service.spec.ts` já prova que `findOne` recorta o campo; o que só um teste
   * ponta a ponta prova é que a cadeia inteira concorda — `OptionalJwtGuard` popula (ou não)
   * `request.user`, o controller deriva `!!user`, o serviço serializa. Esconder no cliente
   * não seria proteção nenhuma: o JSON estaria lá para quem abrisse o DevTools.
   */
  describe('dados do proprietário em GET /properties/:id', () => {
    const ownerName = 'Maria Proprietária';
    const ownerPhone = '11987654321';
    let propertyId: string;

    beforeAll(async () => {
      const created = await request(app.getHttpServer())
        .post('/properties')
        .set('Cookie', accessToken)
        .send({
          description: 'Terreno criado pelo e2e para checar o contato do proprietário',
          type: 'LAND',
          businessType: 'SALE',
          saleTypes: ['DIRECT'],
          price: '100000.00',
          totalArea: 500,
          neighborhood: 'Centro',
          city: 'Sorocaba',
          state: 'SP',
          ownerName,
          ownerPhone,
          land: { zoning: 'RESIDENTIAL', topography: 'FLAT' },
        })
        .expect(201);

      propertyId = (created.body as { id: string }).id;
    });

    it('o autenticado recebe nome e telefone', async () => {
      const res = await request(app.getHttpServer())
        .get(`/properties/${propertyId}`)
        .set('Cookie', accessToken)
        .expect(200);

      expect((res.body as { owner: unknown }).owner).toEqual({
        name: ownerName,
        phone: ownerPhone,
      });
    });

    it('o anônimo recebe owner null, e o telefone não aparece em lugar nenhum do corpo', async () => {
      // O imóvel nasce PENDING (sem fotos), então um anônimo não o enxerga pelo id — é o
      // recorte de inventário, não o de proprietário. Publicar primeiro é o que faz este
      // teste medir o que ele diz medir.
      await request(app.getHttpServer())
        .patch(`/properties/${propertyId}/status`)
        .set('Cookie', accessToken)
        .send({ status: 'ACTIVE' })
        .expect(200);

      const res = await request(app.getHttpServer()).get(`/properties/${propertyId}`).expect(200);

      expect((res.body as { owner: unknown }).owner).toBeNull();
      // A asserção que importa: não basta o campo vir null, o valor não pode estar em
      // nenhum outro canto da resposta.
      expect(JSON.stringify(res.body)).not.toContain(ownerPhone);
      expect(JSON.stringify(res.body)).not.toContain(ownerName);
    });

    it('o PATCH atualiza os dois campos', async () => {
      // Caminho separado do POST, e a distinção não é acadêmica: `createWithRetry` monta o
      // `data` do Prisma campo a campo (uma allowlist), enquanto o `update` espalha o DTO.
      // Esquecer a allowlist gravava um imóvel sem proprietário em silêncio — foi assim que
      // este teste nasceu.
      await request(app.getHttpServer())
        .patch(`/properties/${propertyId}`)
        .set('Cookie', accessToken)
        .send({ ownerName: 'Outro Dono', ownerPhone: '11912345678' })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/properties/${propertyId}`)
        .set('Cookie', accessToken)
        .expect(200);

      expect((res.body as { owner: unknown }).owner).toEqual({
        name: 'Outro Dono',
        phone: '11912345678',
      });
    });

    it('criar sem os dados do proprietário é recusado com 400', async () => {
      await request(app.getHttpServer())
        .post('/properties')
        .set('Cookie', accessToken)
        .send({
          description: 'Terreno sem proprietário, que a validação precisa recusar',
          type: 'LAND',
          businessType: 'SALE',
          saleTypes: ['DIRECT'],
          price: '100000.00',
          totalArea: 500,
          neighborhood: 'Centro',
          city: 'Sorocaba',
          state: 'SP',
          land: { zoning: 'RESIDENTIAL', topography: 'FLAT' },
        })
        .expect(400);
    });
  });
});
