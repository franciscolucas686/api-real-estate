import { GeocodingStatus, PrismaClient } from '@prisma/client';
import { normalizeSlug, PROPERTIES } from './properties.seed';

export async function seedLocationCache(prisma: PrismaClient): Promise<void> {
  console.log('\n[5/6] Geocodificando localizações...');

  const locations = [
    ...new Map(PROPERTIES.map((p) => [`${p.neighborhood}|${p.city}|${p.state}`, p])).values(),
  ].map((p) => ({ neighborhood: p.neighborhood, city: p.city, state: p.state }));

  let resolved = 0;
  let failed = 0;

  for (const { neighborhood, city, state } of locations) {
    const query = `${neighborhood}, ${city}, ${state}, Brasil`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'real-estate-api/1.0 (property-map-feature)',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });

      const data: { lat: string; lon: string }[] = res.ok ? await res.json() : [];
      const coords = data[0]
        ? { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) }
        : null;

      const nbh = await prisma.neighborhood.upsert({
        where: {
          slug_city_state: {
            slug: normalizeSlug(neighborhood),
            city,
            state,
          },
        },
        create: {
          slug: normalizeSlug(neighborhood),
          displayName: neighborhood,
          city,
          state,
        },
        update: {},
      });

      await prisma.locationCache.upsert({
        where: { neighborhoodId: nbh.id },
        create: {
          neighborhoodId: nbh.id,
          status: coords ? GeocodingStatus.RESOLVED : GeocodingStatus.NOT_FOUND,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          resolvedAt: coords ? new Date() : null,
        },
        update: {
          status: coords ? GeocodingStatus.RESOLVED : GeocodingStatus.NOT_FOUND,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          resolvedAt: coords ? new Date() : null,
        },
      });

      if (coords) {
        await prisma.property.updateMany({
          where: {
            neighborhood: {
              slug: normalizeSlug(neighborhood),
              city,
              state,
            },
          },
          data: {
            latitude: coords.latitude,
            longitude: coords.longitude,
          },
        });

        console.log(
          `      ✓ ${neighborhood}, ${city} → (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`,
        );
        resolved++;
      } else {
        console.log(`      ✗ ${neighborhood}, ${city} → não encontrado`);
        failed++;
      }
    } catch (err) {
      console.warn(`      ⚠ ${neighborhood}, ${city}: ${(err as Error).message}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 1100));
  }

  console.log(`      ${resolved} resolvidos, ${failed} falhas`);
}
