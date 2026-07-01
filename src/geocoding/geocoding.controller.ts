import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ForwardGeocodeDto,
  ForwardGeocodeResponseDto,
  ReverseGeocodeDto,
  ReverseGeocodeResponseDto,
} from './dto';
import { GeocodingService } from './geocoding.service';

@ApiTags('geocoding')
@Controller('geocode')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Post('forward')
  @ApiOperation({
    summary: 'Forward geocoding',
    description:
      'Converte endereço (bairro, cidade, estado) em coordenadas. Retorna null quando o endereço não é encontrado pelo Nominatim.',
  })
  @ApiBody({ type: ForwardGeocodeDto })
  @ApiResponse({
    status: 200,
    description: 'Coordenadas encontradas (ou null se não encontrado)',
    content: {
      'application/json': {
        examples: {
          encontrado: {
            summary: 'Endereço encontrado',
            value: { latitude: -23.5614, longitude: -46.6557 },
          },
          naoEncontrado: {
            summary: 'Endereço não encontrado',
            value: null,
          },
        },
      },
    },
  })
  async geocodeForward(@Body() dto: ForwardGeocodeDto): Promise<ForwardGeocodeResponseDto | null> {
    return this.geocodingService.geocode(dto.neighborhood, dto.city, dto.state);
  }

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
