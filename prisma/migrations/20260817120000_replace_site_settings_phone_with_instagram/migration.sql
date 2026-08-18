-- Telefone fixo dá lugar ao Instagram no bloco de contato do site.
--
-- Não há backfill possível nem desejável: um telefone não vira handle de Instagram, então
-- o valor antigo é descartado junto com a coluna. A coluna nova entra NOT NULL DEFAULT ''
-- como todas as outras deste modelo, o que faz a linha singleton existente sobreviver ao
-- ADD COLUMN sem precisar de UPDATE — ela passa a ter instagram = '', e a página de
-- contato simplesmente não desenha o card até o operador preencher.

-- AlterTable
ALTER TABLE "SiteSettings" DROP COLUMN "phone",
ADD COLUMN     "instagram" TEXT NOT NULL DEFAULT '';
