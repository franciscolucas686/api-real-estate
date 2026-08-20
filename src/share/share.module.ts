import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';

/**
 * Depende de `PrismaModule` direto, não de `PropertiesModule`.
 *
 * O card precisa de um punhado de colunas e de uma foto; `PropertiesService.findOne`
 * entregaria isso junto com as cinco tabelas de subtipo, a galeria inteira e uma consulta
 * extra de WhatsApp. A query própria (`SHARE_CARD_SELECT`) evita esse peso e, mais
 * importante, mantém este módulo desacoplado do payload de detalhe — que muda por razões
 * que nada têm a ver com compartilhamento.
 *
 * O que os dois compartilham é a regra que precisa ser compartilhada: a visibilidade
 * pública, em `properties/property-visibility.ts`.
 */
@Module({
  imports: [PrismaModule, AppConfigModule],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
