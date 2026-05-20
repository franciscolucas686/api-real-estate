import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GeocodingService } from './geocoding.service';
import { LocationCacheService } from './location-cache.service';

@Module({
  imports: [PrismaModule],
  providers: [GeocodingService, LocationCacheService],
  exports: [LocationCacheService],
})
export class GeocodingModule {}
