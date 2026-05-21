import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { LocationCacheService } from './location-cache.service';

@Injectable()
export class GeocodingEventsHandler {
  private readonly logger = new Logger(GeocodingEventsHandler.name);

  constructor(private readonly locationCacheService: LocationCacheService) {}

  @OnEvent('property.saved')
  async handlePropertySaved(payload: { neighborhoodId: string }): Promise<void> {
    try {
      await this.locationCacheService.getCoords(payload.neighborhoodId);
    } catch (err) {
      this.logger.warn(
        `Failed to geocode neighborhood ${payload.neighborhoodId}: ${(err as Error).message}`,
      );
    }
  }
}
