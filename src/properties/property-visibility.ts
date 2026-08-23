import { Prisma, PropertyStatus } from '@prisma/client';

/**
 * A fronteira de visibilidade pública dos imóveis, numa definição só.
 *
 * São duas condições, e as duas são de segurança, não de conveniência:
 * - `deletedAt: null` mantém imóvel na lixeira fora de qualquer leitura;
 * - anônimo é **fixado** em `ACTIVE`, o que impede inventário não publicado
 *   (`PENDING`/`INACTIVE`) de vazar por um endpoint público. Esse vazamento já foi
 *   fechado uma vez — ver o CLAUDE.md.
 *
 * Existia em duas cópias inline, `findOne` e `buildWhereClause`, sincronizadas à mão:
 * a segunda carregava um comentário dizendo "Mirrors findOne()'s auth-aware filtering",
 * o que descreve exatamente o problema — uma regra de segurança mantida por convenção
 * funciona enquanto alguém lembrar. O módulo `share` seria a terceira cópia, e uma
 * divergência ali significaria um imóvel não publicado ganhando card, foto e preço num
 * link do WhatsApp.
 *
 * Quem compõe filtros por cima (a listagem, que ainda resolve `?status=` para
 * autenticado) continua livre para fazê-lo: isto é o piso, não o filtro inteiro.
 *
 * Pinado por `properties.service.spec.ts`, que inspeciona a cláusula gerada e não só o
 * resultado — ver os casos "chamada anônima ... é fixada em ACTIVE" e
 * "soft delete continua excluído em qualquer escopo".
 */
export function publicVisibilityWhere(isAuthenticated = false): Prisma.PropertyWhereInput {
  return {
    deletedAt: null,
    ...(isAuthenticated ? {} : { status: PropertyStatus.ACTIVE }),
  };
}

/**
 * O contato do proprietário, ou `null` — a fronteira de visibilidade do dado privado, ao
 * lado da fronteira do inventário acima.
 *
 * Mora aqui, e não inline no `findOne`, pelo mesmo motivo que `publicVisibilityWhere`:
 * regra de segurança mantida por convenção funciona enquanto alguém lembrar. A diferença é
 * que esta não é uma cláusula de busca — as colunas **vêm** do banco em toda leitura, e o
 * que decide é a serialização. É por isso que `findOne` monta o DTO campo a campo: nada
 * vaza por acidente, só vaza o que for escrito lá.
 *
 * Devolver `null` (em vez de dois campos vazios) dá ao cliente uma checagem só, e funde de
 * propósito dois casos que ele não precisa distinguir: "não posso ver" e "ainda não
 * preenchido". O segundo existe porque as colunas são anuláveis para as linhas anteriores
 * à migração — ver 20260823170000_add_property_owner_contact.
 *
 * Pinado por `properties.service.spec.ts`, no caso "chamada anônima não recebe o contato do
 * proprietário mesmo com as colunas preenchidas", e ponta a ponta em
 * `test/properties-list.e2e-spec.ts`.
 */
export function ownerContactFor(
  property: { ownerName: string | null; ownerPhone: string | null },
  isAuthenticated: boolean,
): { name: string; phone: string } | null {
  if (!isAuthenticated) return null;
  if (!property.ownerName || !property.ownerPhone) return null;

  return { name: property.ownerName, phone: property.ownerPhone };
}
