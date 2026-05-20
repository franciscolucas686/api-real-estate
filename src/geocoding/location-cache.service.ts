import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from './geocoding.service';

type Coordinates = { latitude: number; longitude: number };

@Injectable()
export class LocationCacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
  ) {}

  async getOrResolve(neighborhood: string, city: string, state: string): Promise<void> {
    const existing = await this.prisma.locationCache.findUnique({
      where: { neighborhood_city_state: { neighborhood, city, state } },
    });

    if (existing) return;

    const coords = await this.geocodingService.geocode(neighborhood, city, state);

    await this.prisma.locationCache.create({
      data: {
        neighborhood,
        city,
        state,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        resolvedAt: coords ? new Date() : null,
      },
    });
  }

  async getCoords(neighborhood: string, city: string, state: string): Promise<Coordinates | null> {
    const entry = await this.prisma.locationCache.findUnique({
      where: { neighborhood_city_state: { neighborhood, city, state } },
      select: { latitude: true, longitude: true },
    });

    if (!entry || entry.latitude == null || entry.longitude == null) return null;

    return { latitude: entry.latitude, longitude: entry.longitude };
  }
}
