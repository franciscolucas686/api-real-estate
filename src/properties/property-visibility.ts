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
