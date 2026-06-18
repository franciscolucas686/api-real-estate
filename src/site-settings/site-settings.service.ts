import { Injectable } from '@nestjs/common';
import { SiteSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSiteSettingsDto } from './dto';

const SINGLETON_ID = 'singleton';

const DEFAULTS: Omit<SiteSettings, 'updatedAt'> = {
  id: SINGLETON_ID,
  whatsapp: '',
  email: '',
  phone: '',
  hours: '',
};

@Injectable()
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrDefault(): Promise<SiteSettings> {
    const record = await this.prisma.siteSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
    return record ?? { ...DEFAULTS, updatedAt: new Date(0) };
  }

  async upsert(dto: UpdateSiteSettingsDto): Promise<SiteSettings> {
    return this.prisma.siteSettings.upsert({
      where: { id: SINGLETON_ID },
      update: dto,
      create: { id: SINGLETON_ID, ...dto },
    });
  }
}
