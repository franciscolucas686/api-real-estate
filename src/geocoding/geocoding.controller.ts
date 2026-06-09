import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ReverseGeocodeDto, ReverseGeocodeResponseDto } from './dto';
import { GeocodingService } from './geocoding.service';

@ApiTags('geocoding')
@Controller('geocode')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Post('reverse')
  @ApiOperation({
    summary: 'Reverse geocoding',
    description:
      'Converte coordenadas (latitude, longitude) em endereço com bairro, cidade e estado',
  })
  @ApiBody({ type: ReverseGeocodeDto })
  @ApiResponse({
    status: 200,
    description: 'Endereço encontrado com sucesso',
    type: ReverseGeocodeResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Coordenadas inválidas ou serviço de geocoding não disponível',
  })
  async reverseGeocode(@Body() dto: ReverseGeocodeDto): Promise<ReverseGeocodeResponseDto> {
    return this.geocodingService.reverseGeocode(dto.latitude, dto.longitude);
  }
}
