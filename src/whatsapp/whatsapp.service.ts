import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WhatsappService {
  private whatsappA: string;
  private whatsappB: string;

  constructor() {
    this.whatsappA = process.env.WHATSAPP_A || '';
    this.whatsappB = process.env.WHATSAPP_B || '';

    if (!this.whatsappA || !this.whatsappB) {
      throw new Error('WHATSAPP_A e WHATSAPP_B devem ser definidos nas variáveis de ambiente');
    }
  }

  getWhatsappNumber(propertyId: string): string {
    const hash = this.calculateHash(propertyId);
    const hashValue = parseInt(hash, 16);
    const isEven = hashValue % 2 === 0;

    return isEven ? this.whatsappA : this.whatsappB;
  }

  private calculateHash(propertyId: string): string {
    return crypto.createHash('md5').update(propertyId).digest('hex');
  }

  getWhatsappNumbers() {
    return {
      whatsappA: this.whatsappA,
      whatsappB: this.whatsappB,
    };
  }
}
