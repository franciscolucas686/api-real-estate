import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BusinessType,
  PrismaClient,
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

// ─── Unsplash photo pools ─────────────────────────────────────────────────────

const PHOTOS: Record<string, string[]> = {
  living: [
    'photo-1555041469-a586c61ea9bc',
    'photo-1493809842364-78817add7ffb',
    'photo-1567767292278-a4f21aa2d36e',
    'photo-1560185007-5f0bb1866cab',
    'photo-1583847268964-b28dc8f51f92',
  ],
  kitchen: [
    'photo-1556909114-f6e7ad7d3136',
    'photo-1484154218962-a197022b5858',
    'photo-1556909172-54557c7e4fb7',
    'photo-1565538810643-b5bdb714032a',
    'photo-1556909212-d5b604d0c90d',
  ],
  bedroom: [
    'photo-1631049307264-da0ec9d70304',
    'photo-1505693314120-0d443867891c',
    'photo-1522771739844-6a9f6d5f14af',
    'photo-1540518614846-7eded433c457',
    'photo-1616594039964-ae9021a400a0',
  ],
  bathroom: [
    'photo-1552321554-5fefe8c9ef14',
    'photo-1507652313519-d4e9174996dd',
    'photo-1620626011761-996317702149',
    'photo-1584622650111-993a426fbf0a',
    'photo-1566417025-cba93e26a5f8',
  ],
  exterior: [
    'photo-1558618666-fcd25c85cd64',
    'photo-1580587771525-78b9dba3b914',
    'photo-1568605114967-8130f3a36994',
    'photo-1512917922-1f1d7cc21a62',
    'photo-1494526585-d7f6f2b7ec4e',
  ],
};

function photoCategory(roomName: string): string {
  const n = roomName.toLowerCase();
  if (n.includes('sala') || n.includes('jantar')) return 'living';
  if (n.includes('cozinha')) return 'kitchen';
  if (n.includes('quarto') || n.includes('suite') || n.includes('dormit')) return 'bedroom';
  if (n.includes('banheiro') || n.includes('lavabo')) return 'bathroom';
  return 'exterior';
}

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

async function fetchBuffer(photoId: string): Promise<Buffer> {
  const url = `https://images.unsplash.com/${photoId}?w=1920&q=80&auto=format&fit=crop`;
  const res = await fetch(url, { headers: { Accept: 'image/jpeg,image/*' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── DB cleanup ───────────────────────────────────────────────────────────────

async function cleanDatabase(): Promise<void> {
  console.log('[2/5] Limpando banco de dados...');

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
}

// ─── Admin user ───────────────────────────────────────────────────────────────

async function seedUser(): Promise<string> {
  console.log('[3/5] Criando usuário admin...');

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

async function seedProperties(userId: string): Promise<void> {
  console.log(`[4/5] Criando ${PROPERTIES.length} propriedades...`);

  for (let pi = 0; pi < PROPERTIES.length; pi++) {
    const def = PROPERTIES[pi];
    console.log(`\n  [${pi + 1}/${PROPERTIES.length}] ${def.type} – ${def.city}/${def.state}`);

    const property = await prisma.property.create({
      data: {
        code: generateCode(),
        userId,
        type: def.type,
        businessType: def.businessType,
        price: def.price,
        ...(def.rentPrice !== undefined && { rentPrice: def.rentPrice }),
        ...(def.condoFee !== undefined && { condoFee: def.condoFee }),
        city: def.city,
        state: def.state,
        neighborhood: def.neighborhood,
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

      const category = photoCategory(roomName);
      const pool = PHOTOS[category];
      console.log(`         Sala "${roomName}" (${category}) – 5 imagens`);

      for (let ii = 0; ii < 5; ii++) {
        const photoId = pool[ii];
        try {
          const buffer = await fetchBuffer(photoId);
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
          console.warn(`\n         ⚠ Falha na imagem ${photoId}: ${(err as Error).message}`);
        }
      }

      process.stdout.write('\n');
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Iniciando seed...\n');

  await cleanR2();
  await cleanDatabase();
  const userId = await seedUser();
  await seedProperties(userId);

  console.log('\n[5/5] Verificando contagens...');
  const [props, rooms, images] = await Promise.all([
    prisma.property.count(),
    prisma.propertyRoom.count(),
    prisma.propertyImage.count(),
  ]);
  console.log(`      Property: ${props}  PropertyRoom: ${rooms}  PropertyImage: ${images}`);
  console.log('\n✅ Seed concluído!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
