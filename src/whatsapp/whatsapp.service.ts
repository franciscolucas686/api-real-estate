import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { WhatsappNumber } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWhatsappNumberDto, UpdateWhatsappNumberDto } from './dto';
import { WhatsappNumberNotFoundError } from '../common/errors';

@Injectable()
export class WhatsappService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Distribui os imóveis entre os números ativos de forma estável: o mesmo imóvel
   * cai sempre no mesmo número, sem estado nem coluna para isso.
   */
  async getWhatsappNumber(propertyId: string): Promise<string | null> {
    const numbers = await this.prisma.whatsappNumber.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { number: true },
    });

    if (numbers.length === 0) {
      return null;
    }

    return numbers[this.hashIndex(propertyId) % numbers.length].number;
  }

  /**
   * Inteiro de 32 bits derivado do id — **não** o MD5 inteiro.
   *
   * Era `parseInt(md5, 16)`, e isso não distribuía nada. Os 32 dígitos hex são um
   * número de 128 bits, muito além dos 53 que um `double` representa exatamente:
   * o valor resultante é sempre um múltiplo de 2^75, ou seja, par. Com 2 números
   * cadastrados, `% 2` dava 0 para **todo** imóvel e o segundo número nunca recebia
   * nenhum; com 4, idem. Só uma quantidade ímpar de números escapava, e por acidente.
   *
   * Oito dígitos hex cabem inteiros num inteiro exato, então o resto volta a variar.
   * A consequência de trocar é uma redistribuição única dos imóveis já cadastrados
   * entre os números — o mapeamento é arbitrário por natureza, e nada depende do
   * valor anterior.
   */
  private hashIndex(propertyId: string): number {
    return parseInt(crypto.createHash('md5').update(propertyId).digest('hex').slice(0, 8), 16);
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
