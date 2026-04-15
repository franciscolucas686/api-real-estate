import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [AppConfigModule],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
