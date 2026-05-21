import { Injectable } from '@nestjs/common';

type Coordinates = { latitude: number; longitude: number };

type NominatimResult = { lat: string; lon: string };

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
}
