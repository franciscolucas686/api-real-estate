import { Prisma } from '@prisma/client';

/**
 * O mínimo para montar um card de compartilhamento, e nada além.
 *
 * Espelha o `PROPERTY_CARD_SELECT` da listagem pelo mesmo motivo. O caminho óbvio seria
 * reusar `PropertiesService.findOne`, mas ele carrega as cinco tabelas de subtipo (quatro
 * sempre `null`), **todas** as fotos, **todos** os ambientes com todas as fotos de cada um,
 * `saleTypes`, o `locationCache` do bairro, e ainda dispara uma segunda consulta para o
 * número de WhatsApp. Num imóvel com 40 fotos isso materializa 40 linhas para usar uma — e
 * como o card são duas rotas (HTML e imagem), o custo saía dobrado.
 *
 * Os `take` minúsculos são o ponto: a capa é uma foto só, então no máximo três linhas de
 * imagem voltam, independente do tamanho da galeria.
 *
 * As duas rotas usam esta mesma forma. A da imagem carrega alguns escalares que não usa,
 * o que é irrelevante perto de manter uma definição só.
 */
export const SHARE_CARD_SELECT = {
  id: true,
  code: true,
  type: true,
  businessType: true,
  price: true,
  rentPrice: true,
  bedrooms: true,
  bathrooms: true,
  totalArea: true,
  neighborhood: {
    select: { displayName: true, city: true, state: true },
  },
  // A foto principal, se o operador escolheu uma, e a primeira sem ambiente, que é onde a
  // capa cai quando ele não escolheu. As duas na mesma relação porque o Prisma não permite
  // selecionar `images` duas vezes; `take: 2` é o pior caso (uma principal que é de ambiente
  // + uma solta), e `roomId`/`isMain` no `select` é o que deixa `coverImageUrl` separá-las.
  images: {
    where: { OR: [{ roomId: null }, { isMain: true }] },
    orderBy: [{ isMain: 'desc' }, { order: 'asc' }],
    take: 2,
    select: { url: true, roomId: true, isMain: true },
  },
  // Fallback: a primeira foto do primeiro ambiente, para o imóvel que organizou tudo em
  // ambientes e não tem nenhuma solta.
  rooms: {
    orderBy: { order: 'asc' },
    take: 1,
    select: {
      images: {
        orderBy: { order: 'asc' },
        take: 1,
        select: { url: true },
      },
    },
  },
} satisfies Prisma.PropertySelect;

export type ShareCardRow = Prisma.PropertyGetPayload<{ select: typeof SHARE_CARD_SELECT }>;

/**
 * A foto de capa: a principal, senão uma solta, senão a primeira do primeiro ambiente,
 * senão nenhuma.
 *
 * Os três últimos degraus são a heurística que sempre existiu, e continuam valendo inteiros
 * para todo imóvel sem principal — que é o estado de todos eles até alguém escolher uma. O
 * degrau novo é só o primeiro, e é ele que faz a capa do WhatsApp concordar com a foto que
 * abre o carrossel do card.
 */
export function coverImageUrl(property: ShareCardRow): string | null {
  const mainImage = property.images.find((image) => image.isMain);
  const unassignedImage = property.images.find((image) => !image.roomId);

  return mainImage?.url ?? unassignedImage?.url ?? property.rooms[0]?.images[0]?.url ?? null;
}
