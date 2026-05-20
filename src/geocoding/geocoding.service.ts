import { Injectable, Logger } from '@nestjs/common';

type Coordinates = { latitude: number; longitude: number };

type NominatimResult = {
  lat: string;
  lon: string;
};

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  async geocode(neighborhood: string, city: string, state: string): Promise<Coordinates | null> {
    const query = `${neighborhood}, ${city}, ${state}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'real-estate-api/1.0 (property-map-feature)',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });

      if (!res.ok) {
        this.logger.warn(`Nominatim returned HTTP ${res.status} for query: ${query}`);
        return null;
      }

      const data: NominatimResult[] = await res.json();

      if (!data.length) {
        this.logger.warn(`Nominatim found no results for: ${query}`);
        return null;
      }

      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
      };
    } catch (err) {
      this.logger.warn(`Nominatim request failed for "${query}": ${(err as Error).message}`);
      return null;
    }
  }
}
