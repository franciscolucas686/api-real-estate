import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { R2Service } from '../src/r2/r2.service';
import { createAppValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end de `/share`, e o que só esta camada consegue provar.
 *
 * Duas armadilhas do app inteiro convergem nesta rota, e nenhuma aparece num spec de
 * serviço:
 *
 * 1. O `AllExceptionsFilter` é global e termina em `response.json(...)` sem negociar
 *    conteúdo. Qualquer exceção que escape transforma o card em **JSON** — o crawler não
 *    acha as OG tags e o visitante encontra um objeto cru. Por isso os casos de id
 *    inexistente e malformado afirmam `text/html`, não só o status.
 * 2. O `ValidationPipe` global roda com `forbidNonWhitelisted: true`. Links compartilhados
 *    chegam com `?fbclid=…` colado pelo próprio WhatsApp/Facebook; como a rota não declara
 *    `@Query()`, esses parâmetros são ignorados em vez de virarem 400. O caso do `fbclid`
 *    existe para travar isso: declarar um `@Query()` aqui no futuro quebraria todo link já
 *    compartilhado, e o teste falha antes de alguém descobrir em produção.
 */
describe('Share (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let activeId: string;
  let inactiveId: string;

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

    prisma = app.get(PrismaService);

    const active = await prisma.property.findFirstOrThrow({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    activeId = active.id;

    const inactive = await prisma.property.findFirstOrThrow({
      where: { status: { not: 'ACTIVE' }, deletedAt: null },
      select: { id: true },
    });
    inactiveId = inactive.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('devolve HTML com as OG tags do imóvel publicado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/share/properties/${activeId}`)
      .expect(200)
      .expect('Content-Type', /text\/html/);

    expect(res.text).toContain('property="og:title"');
    expect(res.text).toContain('property="og:description"');
    // Aponta para a SPA, não para esta rota — é o que consolida o compartilhamento na
    // URL real do imóvel.
    expect(res.text).toContain(`/properties/${activeId}"`);
    expect(res.text).toContain('http-equiv="refresh"');
  });

  it('emite og:image absoluto, que é o que o crawler consegue resolver', async () => {
    const res = await request(app.getHttpServer()).get(`/share/properties/${activeId}`).expect(200);

    const match = res.text.match(/property="og:image" content="([^"]+)"/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/^https?:\/\//);
    expect(match![1]).toContain(`/share/properties/${activeId}/image.jpg`);
  });

  it('ignora o ?fbclid= que o WhatsApp cola no link, em vez de responder 400', async () => {
    await request(app.getHttpServer())
      .get(`/share/properties/${activeId}?fbclid=IwAR0abcdef&utm_source=whatsapp`)
      .expect(200)
      .expect('Content-Type', /text\/html/);
  });

  it('imóvel não publicado não vaza nada no card', async () => {
    const res = await request(app.getHttpServer())
      .get(`/share/properties/${inactiveId}`)
      .expect(200)
      .expect('Content-Type', /text\/html/);

    // Card genérico: sem preço, sem specs, sem foto.
    expect(res.text).toContain('Francine Gestora Imobiliária');
    expect(res.text).not.toContain('og:image');
    expect(res.text).not.toMatch(/R\$/);
  });

  it('id inexistente devolve HTML, não o JSON do filtro global', async () => {
    const res = await request(app.getHttpServer())
      .get('/share/properties/00000000-0000-0000-0000-000000000000')
      .expect(200)
      .expect('Content-Type', /text\/html/);

    expect(res.text).toContain('<!doctype html>');
  });

  it('id malformado também devolve HTML — por isso não há ParseUUIDPipe aqui', async () => {
    const res = await request(app.getHttpServer())
      .get('/share/properties/nao-e-uuid')
      .expect(200)
      .expect('Content-Type', /text\/html/);

    expect(res.text).toContain('<!doctype html>');
  });

  it('a imagem responde 404 quando o original não pode ser buscado, sem derrubar a rota', async () => {
    // O seed de teste aponta para `https://placeholder.test/fake.jpg`, que não resolve —
    // exatamente o caminho de falha que precisa devolver 404 em vez de estourar.
    await request(app.getHttpServer())
      .get(`/share/properties/${activeId}/image.jpg`)
      .expect(404);
  }, 20_000);

  it('a imagem de um imóvel não publicado é 404', async () => {
    await request(app.getHttpServer()).get(`/share/properties/${inactiveId}/image.jpg`).expect(404);
  });
});
