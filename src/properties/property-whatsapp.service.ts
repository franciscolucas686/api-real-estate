import { Injectable } from '@nestjs/common';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class PropertyWhatsappService {
  constructor(private readonly whatsapp: WhatsappService) {}

  getWhatsappNumber(propertyId: string): string {
    return this.whatsapp.getWhatsappNumber(propertyId);
  }
}
