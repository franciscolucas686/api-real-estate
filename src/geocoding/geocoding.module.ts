import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingEventsHandler } from './geocoding-events.handler';
import { GeocodingService } from './geocoding.service';
import { LocationCacheService } from './location-cache.service';

@Module({
  imports: [PrismaModule],
  providers: [GeocodingService, LocationCacheService, GeocodingEventsHandler],
})
export class GeocodingModule {}
