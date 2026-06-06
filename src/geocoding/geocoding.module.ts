import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingController } from './geocoding.controller';
import { GeocodingEventsHandler } from './geocoding-events.handler';
import { GeocodingService } from './geocoding.service';
import { LocationCacheService } from './location-cache.service';

@Module({
  imports: [PrismaModule],
  controllers: [GeocodingController],
  providers: [GeocodingService, LocationCacheService, GeocodingEventsHandler],
  exports: [GeocodingService],
})
export class GeocodingModule {}
