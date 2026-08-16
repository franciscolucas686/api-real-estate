import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  ForwardGeocodeDto,
  ForwardGeocodeResponseDto,
  ReverseGeocodeDto,
  ReverseGeocodeResponseDto,
} from './dto';
import { GeocodingService } from './geocoding.service';

/**
 * As duas rotas repassam a chamada ao Nominatim, cuja política de uso é de 1
 * requisição por segundo **para a aplicação inteira** e cuja punição é bloqueio por
 * IP. Ficaram abertas por engano — era o único controller do projeto sem guard — o
 * que fazia desta API um proxy gratuito para ele, com o resultado provável sendo o
 * IP de saída bloqueado e a criação de imóvel com coordenadas parando junto.
 *
 * Fechar não custa nada de funcionalidade: o único consumidor é o seletor de mapa do
 * formulário de imóvel, que só existe em rotas autenticadas do app.
 *
 * O teto por rota também é menor que o padrão de 100/60s, porque aqui o custo de uma
 * requisição não é nosso: cada uma consome a cota de um serviço de terceiros que
 * bloqueia o excesso.
 */
@ApiTags('geocoding')
@Controller('geocode')
@UseGuards(JwtGuard)
@ApiSecurity('cookie')
@Throttle({ default: { ttl: 60_000, limit: 20 } })
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
