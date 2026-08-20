import { Injectable, Logger } from '@nestjs/common';
import { BusinessType, PropertyType } from '@prisma/client';
import sharp from 'sharp';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';
import { publicVisibilityWhere } from '../properties/property-visibility';
import { SHARE_CARD_SELECT, coverImageUrl, type ShareCardRow } from './share.select';

/**
 * Rótulos em português para o card.
 *
 * É duplicação do `PropertyTypeLabel` do frontend, e é inevitável: são dois deployables
 * distintos, e este texto precisa existir no HTML **antes** de qualquer JavaScript rodar —
 * é justamente por isso que este módulo existe. Mantido no mínimo: só o que entra no card.
 */
const TYPE_LABEL: Record<PropertyType, string> = {
  HOUSE: 'Casa',
  APARTMENT: 'Apartamento',
  LAND: 'Terreno',
  SMALL_FARM: 'Chácara',
  COUNTRY_HOUSE: 'Sítio',
};

const SITE_NAME = 'Francine Gestora Imobiliária';

/** 1.91:1, a proporção que o Open Graph pede. */
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

/**
 * Teto de bytes do `og:image`, com folga sobre o limite prático (~300KB) acima do qual o
 * WhatsApp costuma exibir o card sem miniatura.
 */
const OG_IMAGE_MAX_BYTES = 250_000;

/**
 * Qualidades tentadas em ordem. A primeira quase sempre resolve — 1200×630 em q75 sai
 * tipicamente entre 100 e 150KB. As seguintes são rede de segurança para a foto que
 * comprime mal, não caminho normal.
 */
const OG_IMAGE_QUALITIES = [75, 60, 45];

/** O original tem ~350KB; um bucket saudável responde muito antes disso. */
const ORIGIN_FETCH_TIMEOUT_MS = 5_000;

@Injectable()
export class ShareService {
  private readonly logger = new Logger(ShareService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** A URL da SPA — o destino real do link, e o que vai no `og:url`/`canonical`. */
  appPropertyUrl(id: string): string {
    return `${this.configService.appPublicUrl}/properties/${encodeURIComponent(id)}`;
  }

  /**
   * Busca o imóvel pela regra pública. Devolve `null` em vez de lançar: quem chama é uma
   * rota que responde HTML, e o `AllExceptionsFilter` global transformaria qualquer
   * exceção em JSON — que é o que o crawler receberia no lugar do card.
   */
  async findShareable(id: string): Promise<ShareCardRow | null> {
    return this.prisma.property.findFirst({
      where: { id, ...publicVisibilityWhere(false) },
      select: SHARE_CARD_SELECT,
    });
  }

  /**
   * A imagem do card, com tamanho garantido.
   *
   * O original guardado é 1920×1080 (~350KB), acima do que o WhatsApp aceita para
   * miniatura — apontar o `og:image` direto para o R2 deixaria a foto na sorte. Aqui ela
   * é recortada para a proporção do Open Graph e reencodada até caber no orçamento.
   *
   * O custo real desta função é o decode do original (~8MB de bitmap cru), que acontece
   * uma vez independente de quantas qualidades sejam tentadas. Quem vier otimizar deve
   * olhar para lá, não para o laço.
   */
  async buildOgImage(id: string): Promise<Buffer | null> {
    const property = await this.findShareable(id);
    if (!property) return null;

    const url = coverImageUrl(property);
    if (!url) return null;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(ORIGIN_FETCH_TIMEOUT_MS) });
      if (!response.ok) {
        this.logger.warn(`Foto de capa respondeu ${response.status} para o imóvel ${id}`);
        return null;
      }
      const original = Buffer.from(await response.arrayBuffer());

      for (const quality of OG_IMAGE_QUALITIES) {
        const candidate = await sharp(original)
          .resize(OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, { fit: 'cover' })
          .jpeg({ quality, progressive: true })
          .toBuffer();

        if (candidate.length <= OG_IMAGE_MAX_BYTES) return candidate;
      }

      // Nenhuma qualidade coube. Devolver assim mesmo seria reintroduzir o problema que
      // esta rota existe para resolver, então o card sai sem imagem.
      this.logger.warn(`Foto de capa do imóvel ${id} não coube no orçamento em nenhuma qualidade`);
      return null;
    } catch (error) {
      this.logger.warn(`Falha ao preparar a imagem de compartilhamento do imóvel ${id}: ${error}`);
      return null;
    }
  }

  /**
   * O HTML do card. Nunca lança — no pior caso devolve o fallback genérico.
   *
   * `apiOrigin` é a origem pública desta API, derivada da requisição em vez de
   * configurada: o `og:image` **precisa** ser absoluto (crawler não resolve caminho
   * relativo de forma confiável), e derivar do request acerta em dev e em produção sem
   * mais uma variável para manter em sincronia. Depende do `trust proxy` de main.ts, que
   * é o que faz `req.protocol` enxergar o `https` terminado pelo Fly.
   */
  async buildSharePage(id: string, apiOrigin: string): Promise<string> {
    let property: ShareCardRow | null = null;

    try {
      property = await this.findShareable(id);
    } catch (error) {
      this.logger.error(`Falha ao buscar o imóvel ${id} para compartilhamento: ${error}`);
    }

    const target = this.appPropertyUrl(id);

    if (!property) {
      // Sem 404 de propósito: um erro faz o WhatsApp não renderizar card nenhum, e o
      // visitante precisa chegar ao app de qualquer forma — lá a própria SPA mostra o
      // "Imóvel não encontrado" dela.
      return this.renderPage({
        title: SITE_NAME,
        description: 'Encontre seu próximo imóvel.',
        imageUrl: null,
        target,
      });
    }

    return this.renderPage({
      title: this.buildTitle(property),
      description: this.buildDescription(property),
      imageUrl: coverImageUrl(property)
        ? `${apiOrigin.replace(/\/$/, '')}/share/properties/${encodeURIComponent(id)}/image.jpg`
        : null,
      target,
    });
  }

  private buildTitle(property: ShareCardRow): string {
    const type = TYPE_LABEL[property.type];
    const price = this.formatMainPrice(property);
    return `${type} · ${property.neighborhood.displayName} — ${price}`;
  }

  private buildDescription(property: ShareCardRow): string {
    const specs = [
      property.bedrooms ? `${property.bedrooms} quartos` : null,
      property.bathrooms ? `${property.bathrooms} banheiros` : null,
      property.totalArea ? `${property.totalArea} m²` : null,
    ].filter((part): part is string => part !== null);

    const place = `${property.neighborhood.city}/${property.neighborhood.state}`;
    const head = specs.length > 0 ? `${specs.join(' · ')} — ${place}` : place;

    return `${head} · Cód. ${property.code}`;
  }

  private formatMainPrice(property: ShareCardRow): string {
    const isRent = property.businessType === BusinessType.RENT;
    const raw = isRent ? property.rentPrice : property.price;
    if (raw === null) return 'Consulte';

    const formatted = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(raw));

    return isRent ? `${formatted}/mês` : formatted;
  }

  private renderPage(page: {
    title: string;
    description: string;
    imageUrl: string | null;
    target: string;
  }): string {
    const title = escapeHtml(page.title);
    const description = escapeHtml(page.description);
    const target = escapeHtml(page.target);

    const imageTags = page.imageUrl
      ? `
    <meta property="og:image" content="${escapeHtml(page.imageUrl)}" />
    <meta property="og:image:width" content="${OG_IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${OG_IMAGE_HEIGHT}" />
    <meta name="twitter:card" content="summary_large_image" />`
      : `
    <meta name="twitter:card" content="summary" />`;

    // O redirect é `meta refresh`, não `<script>`: o helmet sobe com o CSP default, que
    // traz `script-src 'self'` sem `'unsafe-inline'`, então script inline aqui não roda.
    // O crawler lê as OG tags e ignora o refresh; o navegador segue.
    return `<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${target}" />${imageTags}
    <link rel="canonical" href="${target}" />
    <meta http-equiv="refresh" content="0; url=${target}" />
  </head>
  <body>
    <p>Redirecionando… <a href="${target}">clique aqui</a> se não for automático.</p>
  </body>
</html>
`;
  }
}

/**
 * Escapa texto para dentro de atributo HTML.
 *
 * Requisito de segurança, não formatação: a descrição e o bairro são texto livre do
 * operador, e uma aspa dupla fecharia o atributo `content` enquanto um `<` abriria uma
 * tag — injetando markup arbitrário numa página servida pelo domínio da API.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
