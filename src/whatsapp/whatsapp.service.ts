import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { ConfigService } from '../config/config.service';

@Injectable()
export class WhatsappService {
  private whatsappA: string;
  private whatsappB: string;

  constructor(private readonly configService: ConfigService) {
    this.whatsappA = configService.whatsappA;
    this.whatsappB = configService.whatsappB;
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
