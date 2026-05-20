import { Injectable, Logger } from '@nestjs/common';
import { GeocodingStatus, LocationCache } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GeocodingService } from './geocoding.service';

/** Resolved coordinates for a neighborhood. null means unresolved — callers must not render a map. */
export type LocationDto = { latitude: number; longitude: number };

const RETRY_AFTER_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class LocationCacheService {
  private readonly logger = new Logger(LocationCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
  ) {}

  private findCached(neighborhoodId: string): Promise<LocationCache | null> {
    return this.prisma.locationCache.findUnique({ where: { neighborhoodId } });
  }

  private async resolve(neighborhoodId: string): Promise<LocationCache> {
    const nbh = await this.prisma.neighborhood.findUniqueOrThrow({
      where: { id: neighborhoodId },
      select: { displayName: true, city: true, state: true },
    });

    try {
      const coords = await this.geocodingService.geocode(nbh.displayName, nbh.city, nbh.state);

      if (coords) {
        return this.prisma.locationCache.upsert({
          where: { neighborhoodId },
          create: {
            neighborhoodId,
            status: GeocodingStatus.RESOLVED,
            latitude: coords.latitude,
            longitude: coords.longitude,
            resolvedAt: new Date(),
          },
          update: {
            status: GeocodingStatus.RESOLVED,
            latitude: coords.latitude,
            longitude: coords.longitude,
            resolvedAt: new Date(),
            retryAfter: null,
          },
        });
      }

      // Nominatim responded but found nothing — permanent, no retry
      return this.prisma.locationCache.upsert({
        where: { neighborhoodId },
        create: { neighborhoodId, status: GeocodingStatus.NOT_FOUND, resolvedAt: new Date() },
        update: {
          status: GeocodingStatus.NOT_FOUND,
          latitude: null,
          longitude: null,
          resolvedAt: new Date(),
          retryAfter: null,
        },
      });
    } catch (err) {
      this.logger.warn(`Geocoding error for neighborhood ${neighborhoodId}: ${(err as Error).message}`);

      return this.prisma.locationCache.upsert({
        where: { neighborhoodId },
        create: {
          neighborhoodId,
          status: GeocodingStatus.ERROR,
          retryAfter: new Date(Date.now() + RETRY_AFTER_MS),
        },
        update: {
          status: GeocodingStatus.ERROR,
          retryAfter: new Date(Date.now() + RETRY_AFTER_MS),
        },
      });
    }
  }

  /**
   * Returns resolved coordinates for the given neighborhood, or null when
   * coordinates are unavailable.
   *
   * null is returned when:
   * - The location was not found by Nominatim (permanent)
   * - A geocoding error occurred and the retry window has not expired yet
   *
   * Callers should render the map only when a non-null value is returned.
   */
  async getCoords(neighborhoodId: string): Promise<LocationDto | null> {
    const cached = await this.findCached(neighborhoodId);

    if (cached?.status === GeocodingStatus.NOT_FOUND) return null;

    if (
      cached?.status === GeocodingStatus.ERROR &&
      cached.retryAfter !== null &&
      cached.retryAfter > new Date()
    ) {
      return null;
    }

    if (cached?.status === GeocodingStatus.RESOLVED) {
      return { latitude: cached.latitude!, longitude: cached.longitude! };
    }

    // PENDING, ERROR past retryAfter, or no entry — attempt geocoding now
    const result = await this.resolve(neighborhoodId);

    if (result.status === GeocodingStatus.RESOLVED) {
      return { latitude: result.latitude!, longitude: result.longitude! };
    }

    return null;
  }
}
