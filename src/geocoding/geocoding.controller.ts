import { Body, Controller, Post } from '@nestjs/common';
import { ReverseGeocodeDto, ReverseGeocodeResponseDto } from './dto';
import { GeocodingService } from './geocoding.service';

@Controller('geocode')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Post('reverse')
  async reverseGeocode(@Body() dto: ReverseGeocodeDto): Promise<ReverseGeocodeResponseDto> {
    return this.geocodingService.reverseGeocode(dto.latitude, dto.longitude);
  }
}
