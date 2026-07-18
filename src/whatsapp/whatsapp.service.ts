import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { WhatsappNumber } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWhatsappNumberDto, UpdateWhatsappNumberDto } from './dto';
import { WhatsappNumberNotFoundError } from '../common/errors';

@Injectable()
export class WhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  async getWhatsappNumber(propertyId: string): Promise<string | null> {
    const numbers = await this.prisma.whatsappNumber.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    if (numbers.length === 0) {
      return null;
    }

    const hash = this.calculateHash(propertyId);
    const hashValue = parseInt(hash, 16);
    const index = hashValue % numbers.length;

    return numbers[index].number;
  }

  private calculateHash(propertyId: string): string {
    return crypto.createHash('md5').update(propertyId).digest('hex');
  }

  async create(createWhatsappNumberDto: CreateWhatsappNumberDto): Promise<WhatsappNumber> {
    return this.prisma.whatsappNumber.create({
      data: createWhatsappNumberDto,
    });
  }

  async findAll(): Promise<WhatsappNumber[]> {
    return this.prisma.whatsappNumber.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string): Promise<WhatsappNumber> {
    const whatsappNumber = await this.prisma.whatsappNumber.findUnique({
      where: { id },
    });

    if (!whatsappNumber) {
      throw new WhatsappNumberNotFoundError(id);
    }

    return whatsappNumber;
  }

  async update(
    id: string,
    updateWhatsappNumberDto: UpdateWhatsappNumberDto,
  ): Promise<WhatsappNumber> {
    await this.findOne(id);

    return this.prisma.whatsappNumber.update({
      where: { id },
      data: updateWhatsappNumberDto,
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.whatsappNumber.delete({
      where: { id },
    });
  }
}
