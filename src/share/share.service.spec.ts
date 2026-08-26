import { Test, TestingModule } from '@nestjs/testing';
import { BusinessType, PropertyStatus, PropertyType } from '@prisma/client';
import sharp from 'sharp';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShareService } from './share.service';
import { coverImageUrl, type ShareCardRow } from './share.select';

const mockPrismaService = {
  property: { findFirst: jest.fn() },
};

const mockConfigService = {
  appPublicUrl: 'https://app.exemplo.com',
};

const API_ORIGIN = 'https://api.exemplo.com';

/**
 * `Intl.NumberFormat('pt-BR')` separa o "R$" do número com **espaço não-quebrável**
 * (U+00A0), não com espaço comum. Isso está certo na saída — é o comportamento do ICU e o
 * que se quer num preço que não deve quebrar linha —, mas colar um NBSP literal no fonte
 * do teste deixaria uma armadilha invisível para quem editar depois. Normalizar aqui torna
 * a asserção legível e registra o fato.
 */
function normalizeSpaces(html: string): string {
  return html.replace(/ /g, ' ');
}

function buildRow(overrides: Partial<ShareCardRow> = {}): ShareCardRow {
  return {
    id: 'prop-1',
    code: '575301',
    type: PropertyType.HOUSE,
    businessType: BusinessType.SALE,
    price: '450000.00',
    rentPrice: null,
    bedrooms: 3,
    bathrooms: 2,
    totalArea: 120,
    neighborhood: { displayName: 'Centro', city: 'Votorantim', state: 'SP' },
    images: [{ url: 'https://cdn.exemplo.com/prop-1/capa.jpg', roomId: null, isMain: false }],
    rooms: [],
    ...overrides,
  } as unknown as ShareCardRow;
}

describe('ShareService', () => {
  let service: ShareService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShareService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<ShareService>(ShareService);
    prisma = module.get(PrismaService);

    jest.clearAllMocks();
  });

  describe('buildSharePage — o card', () => {
    it('monta título, descrição e imagem a partir do imóvel', async () => {
      prisma.property.findFirst.mockResolvedValue(buildRow());

      const html = normalizeSpaces(await service.buildSharePage('prop-1', API_ORIGIN));

      expect(html).toContain('<meta property="og:title" content="Casa · Centro — R$ 450.000" />');
      expect(html).toContain('3 quartos · 2 banheiros · 120 m² — Votorantim/SP · Cód. 575301');
    });

    it('aponta og:url e canonical para a SPA, não para a própria API', async () => {
      prisma.property.findFirst.mockResolvedValue(buildRow());

      const html = await service.buildSharePage('prop-1', API_ORIGIN);

      // É o que faz o compartilhamento consolidar na URL real do imóvel em vez de na
      // rota de share.
      expect(html).toContain(
        '<meta property="og:url" content="https://app.exemplo.com/properties/prop-1" />',
      );
      expect(html).toContain(
        '<link rel="canonical" href="https://app.exemplo.com/properties/prop-1" />',
      );
      expect(html).toContain('content="0; url=https://app.exemplo.com/properties/prop-1"');
    });

    it('emite og:image absoluto, apontando para a API', async () => {
      prisma.property.findFirst.mockResolvedValue(buildRow());

      const html = await service.buildSharePage('prop-1', API_ORIGIN);

      // Relativo aqui não serve: crawler não resolve caminho relativo com confiança.
      expect(html).toContain(
        '<meta property="og:image" content="https://api.exemplo.com/share/properties/prop-1/image.jpg" />',
      );
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
    });

    it('usa a primeira foto de ambiente quando não há foto solta', async () => {
      prisma.property.findFirst.mockResolvedValue(
        buildRow({
          images: [],
          rooms: [{ images: [{ url: 'https://cdn.exemplo.com/prop-1/sala.jpg' }] }],
        } as unknown as Partial<ShareCardRow>),
      );

      const html = await service.buildSharePage('prop-1', API_ORIGIN);

      expect(html).toContain('og:image');
    });

    /*
     * Direto na função, não pelo HTML: `coverImageUrl` é pura e exportada, e é ela que faz a
     * capa do WhatsApp concordar com a foto que abre o carrossel do card.
     */
    describe('coverImageUrl — a escolha da capa', () => {
      it('prefere a foto principal, mesmo havendo uma solta antes dela', () => {
        const row = buildRow({
          images: [
            { url: 'https://cdn.exemplo.com/prop-1/escolhida.jpg', roomId: 'room-1', isMain: true },
            { url: 'https://cdn.exemplo.com/prop-1/solta.jpg', roomId: null, isMain: false },
          ],
        } as unknown as Partial<ShareCardRow>);

        expect(coverImageUrl(row)).toBe('https://cdn.exemplo.com/prop-1/escolhida.jpg');
      });

      // O estado de todo imóvel até alguém escolher uma principal: a heurística de sempre.
      it('sem principal, cai na primeira foto solta', () => {
        const row = buildRow({
          images: [
            { url: 'https://cdn.exemplo.com/prop-1/solta.jpg', roomId: null, isMain: false },
          ],
          rooms: [{ images: [{ url: 'https://cdn.exemplo.com/prop-1/sala.jpg' }] }],
        } as unknown as Partial<ShareCardRow>);

        expect(coverImageUrl(row)).toBe('https://cdn.exemplo.com/prop-1/solta.jpg');
      });

      it('sem principal e sem foto solta, cai na primeira do primeiro ambiente', () => {
        const row = buildRow({
          images: [],
          rooms: [{ images: [{ url: 'https://cdn.exemplo.com/prop-1/sala.jpg' }] }],
        } as unknown as Partial<ShareCardRow>);

        expect(coverImageUrl(row)).toBe('https://cdn.exemplo.com/prop-1/sala.jpg');
      });

      it('sem foto nenhuma, não há capa', () => {
        const row = buildRow({ images: [], rooms: [] } as unknown as Partial<ShareCardRow>);

        expect(coverImageUrl(row)).toBeNull();
      });
    });

    it('omite og:image quando o imóvel não tem foto nenhuma', async () => {
      prisma.property.findFirst.mockResolvedValue(
        buildRow({ images: [], rooms: [] } as unknown as Partial<ShareCardRow>),
      );

      const html = await service.buildSharePage('prop-1', API_ORIGIN);

      expect(html).not.toContain('og:image');
      expect(html).toContain('name="twitter:card" content="summary"');
    });

    it('formata aluguel com /mês', async () => {
      prisma.property.findFirst.mockResolvedValue(
        buildRow({
          businessType: BusinessType.RENT,
          price: null,
          rentPrice: '2500.00',
        } as unknown as Partial<ShareCardRow>),
      );

      const html = await service.buildSharePage('prop-1', API_ORIGIN);

      expect(html).toContain('/mês');
    });
  });

  /**
   * O ponto de segurança do módulo: `description` e o nome do bairro são texto livre do
   * operador e entram dentro de um atributo `content="..."`. Uma aspa dupla fecharia o
   * atributo e um `<` abriria uma tag, injetando markup numa página servida pelo domínio
   * da API.
   */
  describe('buildSharePage — escape', () => {
    it('não deixa aspas e sinais de menor escaparem do atributo', async () => {
      prisma.property.findFirst.mockResolvedValue(
        buildRow({
          neighborhood: {
            displayName: 'Vila "Nova" <script>alert(1)</script>',
            city: 'Votorantim',
            state: 'SP',
          },
        } as unknown as Partial<ShareCardRow>),
      );

      const html = await service.buildSharePage('prop-1', API_ORIGIN);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&quot;Nova&quot;');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('buildSharePage — fallback', () => {
    it('imóvel inexistente ou não publicado devolve card genérico, ainda com redirect', async () => {
      prisma.property.findFirst.mockResolvedValue(null);

      const html = await service.buildSharePage('sumido', API_ORIGIN);

      expect(html).toContain('Francine Gestora Imobiliária');
      expect(html).not.toContain('og:image');
      // O visitante precisa chegar ao app de qualquer forma — lá a SPA mostra o
      // "Imóvel não encontrado" dela.
      expect(html).toContain('content="0; url=https://app.exemplo.com/properties/sumido"');
    });

    it('erro de banco não escapa — viraria JSON pelo filtro global e o crawler perderia o card', async () => {
      prisma.property.findFirst.mockRejectedValue(new Error('id malformado para a coluna uuid'));

      const html = await service.buildSharePage('nao-e-uuid', API_ORIGIN);

      expect(html).toContain('<!doctype html>');
      expect(html).toContain('Francine Gestora Imobiliária');
    });
  });

  /**
   * A razão de existir da rota de imagem: o original guardado é 1920×1080 (~350KB), acima
   * do teto em que o WhatsApp desiste de renderizar miniatura. O `fetch` é dublado para o
   * teste não depender de rede nem do bucket.
   */
  describe('buildOgImage — o teto de bytes', () => {
    const realFetch = global.fetch;

    afterEach(() => {
      global.fetch = realFetch;
    });

    async function mockOriginalPhoto(): Promise<Buffer> {
      // Ruído, não cor sólida: uma imagem chapada comprime para quase nada e não
      // exercitaria o caminho que importa.
      const noise = Buffer.alloc(1920 * 1080 * 3);
      for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 256);
      return sharp(noise, { raw: { width: 1920, height: 1080, channels: 3 } })
        .jpeg({ quality: 95 })
        .toBuffer();
    }

    it('entrega 1200×630 dentro do orçamento de bytes', async () => {
      prisma.property.findFirst.mockResolvedValue(buildRow());
      const original = await mockOriginalPhoto();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => original.buffer.slice(0, original.length),
      }) as unknown as typeof fetch;

      const image = await service.buildOgImage('prop-1');

      expect(image).not.toBeNull();
      // 250_000 é o orçamento; o teto prático do WhatsApp fica por volta de 300KB.
      expect(image!.length).toBeLessThanOrEqual(250_000);

      const meta = await sharp(image!).metadata();
      expect(meta.width).toBe(1200);
      expect(meta.height).toBe(630);
      expect(meta.format).toBe('jpeg');
    }, 30_000);

    it('devolve null quando o imóvel não tem foto — o card então omite og:image', async () => {
      prisma.property.findFirst.mockResolvedValue(
        buildRow({ images: [], rooms: [] } as unknown as Partial<ShareCardRow>),
      );

      expect(await service.buildOgImage('prop-1')).toBeNull();
    });

    it('devolve null quando o original não responde, em vez de estourar', async () => {
      prisma.property.findFirst.mockResolvedValue(buildRow());
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;

      expect(await service.buildOgImage('prop-1')).toBeNull();
    });

    it('devolve null quando o imóvel não é público', async () => {
      prisma.property.findFirst.mockResolvedValue(null);

      expect(await service.buildOgImage('prop-1')).toBeNull();
    });
  });

  describe('findShareable — visibilidade', () => {
    it('busca apenas o que é público: não deletado e ACTIVE', async () => {
      prisma.property.findFirst.mockResolvedValue(null);

      await service.findShareable('prop-1');

      const where = prisma.property.findFirst.mock.calls[0][0].where;
      expect(where).toMatchObject({
        id: 'prop-1',
        deletedAt: null,
        status: PropertyStatus.ACTIVE,
      });
    });
  });
});
