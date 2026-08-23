-- Contato privado do proprietário do imóvel.
--
-- Anuláveis de propósito, apesar de o DTO de criação exigir os dois. Toda linha já
-- existente ficaria inválida sob NOT NULL e não há valor honesto para backfill — um
-- nome de proprietário não se deduz do imóvel. A obrigatoriedade vive na entrada
-- (CreatePropertyDto) e no formulário; as linhas antigas ficam NULL até serem editadas,
-- e é a própria edição que faz o backfill.
--
-- NULL também é o que a API devolve a quem não está autenticado, então o cliente tem uma
-- checagem só para "não posso ver" e "ainda não preenchido" — ver `ownerContactFor` em
-- src/properties/property-visibility.ts.

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "ownerPhone" TEXT;
