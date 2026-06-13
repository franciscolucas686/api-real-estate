import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BusinessType,
  GeocodingStatus,
  PrismaClient,
  PropertyStatus,
  PropertyType,
  SaleType,
  SunPosition,
  Topography,
  WaterSource,
  Zoning,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import 'dotenv/config';
import sharp from 'sharp';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const r2BucketName = process.env.R2_BUCKET_NAME!;
const r2PublicBaseUrl = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});


// ─── R2 helpers ───────────────────────────────────────────────────────────────

async function cleanR2(): Promise<void> {
  console.log('[1/5] Limpando R2...');
  let token: string | undefined;
  let total = 0;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: r2BucketName, ContinuationToken: token }),
    );
    const objects = list.Contents?.map((o) => ({ Key: o.Key! })) ?? [];

    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({ Bucket: r2BucketName, Delete: { Objects: objects } }),
      );
      total += objects.length;
    }

    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);

  console.log(`      ✓ ${total} objetos removidos do R2`);
}

async function uploadToR2(propertyId: string, buffer: Buffer): Promise<string> {
  const compressed = await sharp(buffer)
    .rotate()
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const key = `${propertyId}/${Date.now()}-${randomUUID()}.jpg`;

  await s3.send(
    new PutObjectCommand({
      Bucket: r2BucketName,
      Key: key,
      Body: compressed,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return `${r2PublicBaseUrl}/${key}`;
}

async function fetchBuffer(index: number): Promise<Buffer> {
  const url = `https://picsum.photos/1920/1080?random=${index}`;
  const res = await fetch(url, {
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── DB cleanup ───────────────────────────────────────────────────────────────

async function cleanDatabase(): Promise<void> {
  console.log('[2/6] Limpando banco de dados...');

  const i = await prisma.propertyImage.deleteMany();
  console.log(`      PropertyImage: ${i.count}`);

  const r = await prisma.propertyRoom.deleteMany();
  console.log(`      PropertyRoom: ${r.count}`);

  const st = await prisma.propertySaleType.deleteMany();
  console.log(`      PropertySaleType: ${st.count}`);

  await Promise.all([
    prisma.apartment.deleteMany(),
    prisma.house.deleteMany(),
    prisma.land.deleteMany(),
    prisma.smallFarm.deleteMany(),
    prisma.countryHouse.deleteMany(),
  ]);
  console.log('      Subtypes: limpos');

  const p = await prisma.property.deleteMany();
  console.log(`      Property: ${p.count}`);

  const lc = await prisma.locationCache.deleteMany();
  console.log(`      LocationCache: ${lc.count}`);
}

// ─── Admin user ───────────────────────────────────────────────────────────────

async function seedUser(): Promise<string> {
  console.log('[3/6] Criando usuário admin...');

  const user = await prisma.user.upsert({
    where: { email: 'admin@imobiliaria.com' },
    update: {},
    create: {
      email: 'admin@imobiliaria.com',
      password: await bcrypt.hash('Admin@123', 10),
      name: 'Admin',
    },
  });

  console.log(`      ✓ ${user.email} (id: ${user.id})`);
  return user.id;
}

// ─── Property definitions ─────────────────────────────────────────────────────

type PropertyDef = {
  type: PropertyType;
  businessType: BusinessType;
  saleTypes?: SaleType[];
  price: string;
  rentPrice?: string;
  condoFee?: string;
  status?: PropertyStatus;
  city: string;
  state: string;
  neighborhood: string;
  description: string;
  totalArea?: number;
  builtArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  suites?: number;
  parkingSpaces?: number;
  latitude?: number;
  longitude?: number;
  rooms: string[];
  house?: {
    floors: number;
    isInCondominium?: boolean;
    condominiumName?: string;
    condominiumAmenities?: string;
  };
  apartment?: {
    floor: number;
    isGroundFloor?: boolean;
    hasElevator: boolean;
    hasBalcony: boolean;
    sunPosition: SunPosition;
    hasPool?: boolean;
  };
  land?: { zoning: Zoning; topography: Topography };
  smallFarm?: {
    hasHouse: boolean;
    hasPool: boolean;
    hasLake: boolean;
    hasFruitTrees: boolean;
    waterSource: WaterSource;
  };
  countryHouse?: { hasRiver: boolean; hasSpring: boolean };
};

const PROPERTIES: PropertyDef[] = [
  // ── 1. Casa – SP – SALE ────────────────────────────────────────────────────
  {
    type: PropertyType.HOUSE,
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.DIRECT, SaleType.FINANCING],
    price: '1850000',
    condoFee: '1200',
    status: PropertyStatus.ACTIVE,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Jardins',
    description:
      'Sobrado moderno com acabamento de alto padrão nos Jardins. Área de lazer completa com piscina e churrasqueira. Localização privilegiada próximo às melhores avenidas e restaurantes da cidade.',
    totalArea: 400,
    builtArea: 320,
    bedrooms: 4,
    bathrooms: 3,
    suites: 2,
    parkingSpaces: 3,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Banheiro'],
    house: { floors: 2, isInCondominium: false },
  },
  // ── 2. Casa – RJ – RENT ───────────────────────────────────────────────────
  {
    type: PropertyType.HOUSE,
    businessType: BusinessType.RENT,
    price: '12000',
    rentPrice: '12000',
    status: PropertyStatus.PENDING,
    city: 'Rio de Janeiro',
    state: 'RJ',
    neighborhood: 'Leblon',
    description:
      'Casa de alto padrão no Leblon com vista parcial para o mar. Toda climatizada, com jardim e churrasqueira. Condomínio fechado com segurança 24h e portaria.',
    totalArea: 280,
    builtArea: 220,
    bedrooms: 3,
    bathrooms: 2,
    suites: 1,
    parkingSpaces: 2,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Banheiro'],
    house: {
      floors: 1,
      isInCondominium: true,
      condominiumName: 'Residencial Leblon Prime',
      condominiumAmenities: 'Segurança 24h, portaria, jardim coletivo',
    },
  },
  // ── 3. Apartamento – SP – SALE ────────────────────────────────────────────
  {
    type: PropertyType.APARTMENT,
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.DIRECT],
    price: '680000',
    condoFee: '850',
    status: PropertyStatus.ACTIVE,
    city: 'São Paulo',
    state: 'SP',
    neighborhood: 'Moema',
    description:
      'Apartamento bem iluminado em Moema com sacada gourmet e vista para a cidade. Lazer completo com piscina e academia. A poucos minutos do Parque do Ibirapuera.',
    totalArea: 90,
    builtArea: 82,
    bedrooms: 2,
    bathrooms: 2,
    suites: 1,
    parkingSpaces: 1,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Banheiro'],
    apartment: {
      floor: 8,
      isGroundFloor: false,
      hasElevator: true,
      hasBalcony: true,
      sunPosition: SunPosition.MORNING,
      hasPool: true,
    },
  },
  // ── 4. Apartamento – Campinas – RENT ─────────────────────────────────────
  {
    type: PropertyType.APARTMENT,
    businessType: BusinessType.RENT,
    price: '2800',
    rentPrice: '2800',
    status: PropertyStatus.PENDING,
    city: 'Campinas',
    state: 'SP',
    neighborhood: 'Cambuí',
    description:
      'Studio moderno em localização privilegiada no Cambuí. Mobiliado, pronto para morar. Perto de restaurantes, farmácias e supermercados.',
    totalArea: 45,
    builtArea: 42,
    bedrooms: 1,
    bathrooms: 1,
    parkingSpaces: 1,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Banheiro'],
    apartment: {
      floor: 3,
      isGroundFloor: false,
      hasElevator: true,
      hasBalcony: false,
      sunPosition: SunPosition.AFTERNOON,
      hasPool: false,
    },
  },
  // ── 5. Apartamento – Curitiba – SALE ─────────────────────────────────────
  {
    type: PropertyType.APARTMENT,
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.FINANCING, SaleType.EXCHANGE],
    price: '920000',
    condoFee: '1100',
    status: PropertyStatus.ACTIVE,
    city: 'Curitiba',
    state: 'PR',
    neighborhood: 'Batel',
    description:
      'Apartamento de luxo no coração do Batel com acabamento premium. Vista panorâmica da cidade. Condomínio com piscina aquecida, spa e salão de festas.',
    totalArea: 145,
    builtArea: 130,
    bedrooms: 3,
    bathrooms: 3,
    suites: 1,
    parkingSpaces: 2,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Banheiro'],
    apartment: {
      floor: 12,
      isGroundFloor: false,
      hasElevator: true,
      hasBalcony: true,
      sunPosition: SunPosition.MORNING,
      hasPool: true,
    },
  },
  // ── 6. Terreno – Ribeirão Preto – SALE ───────────────────────────────────
  {
    type: PropertyType.LAND,
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.DIRECT],
    price: '380000',
    status: PropertyStatus.INACTIVE,
    city: 'Ribeirão Preto',
    state: 'SP',
    neighborhood: 'Vila do Golf',
    description:
      'Terreno plano em condomínio fechado de alto padrão. Infraestrutura completa: asfalto, rede de água, esgoto, energia e iluminação. Ideal para construção de residência de luxo.',
    totalArea: 500,
    rooms: ['Vista Frontal', 'Vista Lateral', 'Vista dos Fundos', 'Área Total'],
    land: { zoning: Zoning.RESIDENTIAL, topography: Topography.FLAT },
  },
  // ── 7. Sítio – Sorocaba – SALE ────────────────────────────────────────────
  {
    type: PropertyType.SMALL_FARM,
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.DIRECT, SaleType.EXCHANGE],
    price: '750000',
    status: PropertyStatus.PENDING,
    city: 'Sorocaba',
    state: 'SP',
    neighborhood: 'Zona Rural',
    description:
      'Sítio com 5 alqueires a 20 minutos do centro de Sorocaba. Casa sede reformada, piscina, pomar e poço artesiano. Excelente para lazer e produção rural.',
    totalArea: 50000,
    builtArea: 180,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 4,
    rooms: ['Sala Principal', 'Cozinha', 'Quarto Principal', 'Área Externa'],
    smallFarm: {
      hasHouse: true,
      hasPool: true,
      hasLake: false,
      hasFruitTrees: true,
      waterSource: WaterSource.WELL,
    },
  },
  // ── 8. Chácara – Atibaia – SALE ───────────────────────────────────────────
  {
    type: PropertyType.COUNTRY_HOUSE,
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.DIRECT],
    price: '1200000',
    status: PropertyStatus.ACTIVE,
    city: 'Atibaia',
    state: 'SP',
    neighborhood: 'Vale das Flores',
    description:
      'Chácara com rio na divisa e ampla área verde em condomínio de chácaras em Atibaia. Casa espaçosa com acabamento rústico e muito charme. Qualidade de vida a 60km de São Paulo.',
    totalArea: 25000,
    builtArea: 280,
    bedrooms: 4,
    bathrooms: 3,
    suites: 2,
    parkingSpaces: 6,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Área Externa'],
    countryHouse: { hasRiver: true, hasSpring: false },
  },
  // ── 9. Casa – Florianópolis – SALE ───────────────────────────────────────
  {
    type: PropertyType.HOUSE,
    businessType: BusinessType.SALE,
    saleTypes: [SaleType.DIRECT, SaleType.FINANCING, SaleType.EXCHANGE],
    price: '3200000',
    condoFee: '3500',
    status: PropertyStatus.ACTIVE,
    city: 'Florianópolis',
    state: 'SC',
    neighborhood: 'Jurerê Internacional',
    description:
      'Mansão em condomínio de altíssimo padrão em Jurerê Internacional, a 200 metros da praia. Projeto arquitetônico assinado, piscina de borda infinita, cinema e spa.',
    totalArea: 800,
    builtArea: 600,
    bedrooms: 5,
    bathrooms: 5,
    suites: 3,
    parkingSpaces: 4,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Banheiro'],
    house: {
      floors: 2,
      isInCondominium: true,
      condominiumName: 'Jurerê Beach Village',
      condominiumAmenities: 'Acesso à praia, segurança 24h, jardinagem, portaria',
    },
  },
  // ── 10. Apartamento – Brasília – RENT ────────────────────────────────────
  {
    type: PropertyType.APARTMENT,
    businessType: BusinessType.RENT,
    price: '4500',
    rentPrice: '4500',
    condoFee: '600',
    status: PropertyStatus.PENDING,
    city: 'Brasília',
    state: 'DF',
    neighborhood: 'Asa Sul',
    description:
      'Apartamento reformado na Asa Sul com acabamento moderno e varanda com churrasqueira. Dois quartos amplos e uma vaga coberta. Próximo ao Parque da Cidade.',
    totalArea: 80,
    builtArea: 72,
    bedrooms: 2,
    bathrooms: 1,
    parkingSpaces: 1,
    rooms: ['Sala de Estar', 'Cozinha', 'Quarto Principal', 'Banheiro'],
    apartment: {
      floor: 5,
      isGroundFloor: false,
      hasElevator: true,
      hasBalcony: true,
      sunPosition: SunPosition.AFTERNOON,
      hasPool: false,
    },
  },
];

// ─── Seed properties ──────────────────────────────────────────────────────────

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

async function seedProperties(userId: string): Promise<void> {
  console.log(`[4/6] Criando ${PROPERTIES.length} propriedades...`);

  for (let pi = 0; pi < PROPERTIES.length; pi++) {
    const def = PROPERTIES[pi];
    console.log(`\n  [${pi + 1}/${PROPERTIES.length}] ${def.type} – ${def.city}/${def.state}`);

    const property = await prisma.property.create({
      data: {
        code: generateCode(),
        user: { connect: { id: userId } },
        type: def.type,
        businessType: def.businessType,
        price: def.price,
        status: def.status ?? PropertyStatus.ACTIVE,
        ...(def.rentPrice !== undefined && { rentPrice: def.rentPrice }),
        ...(def.condoFee !== undefined && { condoFee: def.condoFee }),
        ...(def.latitude !== undefined && { latitude: def.latitude }),
        ...(def.longitude !== undefined && { longitude: def.longitude }),
        neighborhood: {
          connectOrCreate: {
            where: {
              slug_city_state: {
                slug: normalizeSlug(def.neighborhood),
                city: def.city,
                state: def.state,
              },
            },
            create: {
              slug: normalizeSlug(def.neighborhood),
              displayName: def.neighborhood,
              city: def.city,
              state: def.state,
            },
          },
        },
        description: def.description,
        ...(def.totalArea !== undefined && { totalArea: def.totalArea }),
        ...(def.builtArea !== undefined && { builtArea: def.builtArea }),
        ...(def.bedrooms !== undefined && { bedrooms: def.bedrooms }),
        ...(def.bathrooms !== undefined && { bathrooms: def.bathrooms }),
        ...(def.suites !== undefined && { suites: def.suites }),
        ...(def.parkingSpaces !== undefined && { parkingSpaces: def.parkingSpaces }),
        ...(def.saleTypes && {
          saleTypes: { create: def.saleTypes.map((type) => ({ type })) },
        }),
        ...(def.house && { house: { create: def.house } }),
        ...(def.apartment && { apartment: { create: def.apartment } }),
        ...(def.land && { land: { create: def.land } }),
        ...(def.smallFarm && { smallfarm: { create: def.smallFarm } }),
        ...(def.countryHouse && { countryhouse: { create: def.countryHouse } }),
      },
    });

    console.log(`         id: ${property.id}  code: ${property.code}`);

    for (let ri = 0; ri < def.rooms.length; ri++) {
      const roomName = def.rooms[ri];
      const room = await prisma.propertyRoom.create({
        data: { propertyId: property.id, name: roomName, order: ri },
      });

      console.log(`         Sala "${roomName}" – 5 imagens`);

      for (let ii = 0; ii < 5; ii++) {
        try {
          const imageIndex = pi * 20 + ri * 5 + ii;
          const buffer = await fetchBuffer(imageIndex);
          const url = await uploadToR2(property.id, buffer);
          await prisma.propertyImage.create({
            data: {
              propertyId: property.id,
              roomId: room.id,
              url,
              order: ri * 5 + ii,
            },
          });
          process.stdout.write('.');
        } catch (err) {
          process.stdout.write('!');
          console.warn(
            `\n         ⚠ Falha na imagem (#${ii}): ${(err as Error).message}`,
          );
        }
      }

      process.stdout.write('\n');
    }
  }
}

// ─── Location cache ───────────────────────────────────────────────────────────

async function seedLocationCache(): Promise<void> {
  console.log('\n[5/6] Geocodificando localizações...');

  const locations = [
    ...new Map(
      PROPERTIES.map((p) => [`${p.neighborhood}|${p.city}|${p.state}`, p]),
    ).values(),
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

      // Update properties in this neighborhood with geocoded coordinates
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

        console.log(`      ✓ ${neighborhood}, ${city} → (${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)})`);
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed...\n');

  await cleanR2();
  await cleanDatabase();
  const userId = await seedUser();
  await seedProperties(userId);
  await seedLocationCache();

  console.log('\n[6/6] Verificando contagens...');
  const [props, rooms, images, lc] = await Promise.all([
    prisma.property.count(),
    prisma.propertyRoom.count(),
    prisma.propertyImage.count(),
    prisma.locationCache.count(),
  ]);
  console.log(`      Property: ${props}  PropertyRoom: ${rooms}  PropertyImage: ${images}  LocationCache: ${lc}`);
  console.log('\n✅ Seed concluído!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
