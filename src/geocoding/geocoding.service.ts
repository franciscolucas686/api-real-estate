import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';

type Coordinates = { latitude: number; longitude: number };

type NominatimResult = { lat: string; lon: string };

interface NominatimAddress {
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  'ISO3166-2-lvl4'?: string;
}

interface NominatimReverseResponse {
  address?: NominatimAddress;
  lat?: string;
  lon?: string;
}

export interface ReverseGeocodeResult {
  neighborhood: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
}

const MIN_INTERVAL_MS = 1000;

@Injectable()
export class GeocodingService {
  private lastCall = 0;

  private throttle(): Promise<void> {
    const wait = MIN_INTERVAL_MS - (Date.now() - this.lastCall);
    if (wait <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, wait));
  }

  /**
   * Returns coordinates for the given location, or null when Nominatim has no
   * results. Throws on HTTP errors or network failures so callers can
   * distinguish a transient error from a genuine "not found".
   */
  async geocode(displayName: string, city: string, state: string): Promise<Coordinates | null> {
    const query = `${displayName}, ${city}, ${state}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

    await this.throttle();
    this.lastCall = Date.now();

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'real-estate-api/1.0 (property-map-feature)',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });

    if (!res.ok) {
      throw new Error(`Nominatim HTTP ${res.status} for "${query}"`);
    }

    const data: NominatimResult[] = await res.json();

    if (!data.length) return null;

    return { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
  }

  /**
   * Realiza reverse geocoding: converte coordenadas em endereço.
   * Retorna bairro, cidade e estado identificados a partir das coordenadas fornecidas.
   * Lança exceção em caso de erro ou se os dados retornados forem incompletos.
   */
  async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=pt-BR,pt,en`;

    await this.throttle();
    this.lastCall = Date.now();

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'real-estate-api/1.0 (property-map-feature)',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });

      if (!response.ok) {
        throw new InternalServerErrorException('Erro ao consultar serviço de geocoding');
      }

      const data: NominatimReverseResponse = await response.json();

      if (!data.address) {
        throw new BadRequestException(
          'Não foi possível identificar o endereço para as coordenadas fornecidas',
        );
      }

      const neighborhood = this.extractNeighborhood(data.address);
      const city = this.extractCity(data.address);
      const state = this.extractState(data.address);

      if (!neighborhood || !city || !state) {
        throw new BadRequestException(
          'Coordenadas fornecidas não retornaram dados completos de localização',
        );
      }

      return {
        neighborhood,
        city,
        state,
        latitude,
        longitude,
      };
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException('Erro inesperado ao processar geocoding');
    }
  }

  private extractNeighborhood(address: NominatimAddress): string | null {
    return address.neighbourhood || address.suburb || null;
  }

  private extractCity(address: NominatimAddress): string | null {
    return address.city || address.town || address.municipality || address.village || null;
  }

  private extractState(address: NominatimAddress): string | null {
    if (address['ISO3166-2-lvl4']) {
      const parts = address['ISO3166-2-lvl4'].split('-');
      return parts[parts.length - 1] || null;
    }
    return address.state || null;
  }
}
