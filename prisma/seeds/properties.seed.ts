import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  BusinessType,
  PrismaClient,
  PropertyStatus,
  PropertyType,
  SaleType,
  SunPosition,
  Topography,
  WaterSource,
  Zoning,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import pLimit from 'p-limit';
import sharp from 'sharp';

/**
 * Quantas fotos de exemplo baixar do picsum.photos ao mesmo tempo.
 *
 * O laço era estritamente sequencial: 120 downloads de 1920x1080, um de cada vez,
 * o que fazia `npm run db:seed:dev` levar alguns minutos imprimindo pontos — tempo
 * que quem está avaliando o projeto lê como travamento, não como progresso. O custo
 * aqui é rede, não CPU, então a espera era quase toda ociosa.
 *
 * 5 e não mais: é o número de fotos por cômodo, então um cômodo inteiro sai numa
 * rodada e o log continua saindo cômodo a cômodo, na ordem. Subir muito além disso
 * troca um problema por outro — o picsum é um serviço gratuito de terceiros e
 * responde 429 quando se abusa dele, e cada 429 vira uma foto a menos no seed.
 */
const PHOTO_DOWNLOAD_CONCURRENCY = 5;

/**
 * Proprietários da vitrine, gerados pelo índice em vez de escritos em cada uma das dez
 * definições — são dado de demonstração, não parte do que cada imóvel demonstra.
 *
 * Fictícios de propósito: o seed roda num repositório público, e um nome ou telefone real
 * aqui seria dado pessoal versionado. Os números seguem o formato que a API exige (só
 * dígitos, sem DDI) para o botão do proprietário funcionar no ambiente local.
 */
const DEMO_OWNER_NAMES = [
  'Maria Aparecida Ramos',
  'João Batista Nogueira',
  'Cláudia Menezes',
  'Roberto Tanaka',
  'Fernanda Villela',
];

export type PropertyDef = {
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

export const PROPERTIES: PropertyDef[] = [
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

export function normalizeSlug(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function fetchBuffer(index: number): Promise<Buffer> {
  const url = `https://picsum.photos/1920/1080?random=${index}`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export type R2Config = { bucketName: string; publicBaseUrl: string };

/**
 * Primeira coisa que o seed faz, e por isso a primeira que falha quando o ambiente
 * não está de pé. O erro cru do SDK da AWS aqui é `NoSuchBucket` ou um
 * `ECONNREFUSED` — nenhum dos dois menciona MinIO, `docker compose` ou bucket, que
 * são as três coisas que quem está montando o projeto precisa ouvir. Traduzir custa
 * um `try/catch` e é a diferença entre "rode `docker compose up -d`" e uma stack
 * trace de rede.
 */
export async function cleanR2(s3: S3Client, r2Config: R2Config): Promise<void> {
  console.log('[1/6] Limpando R2...');
  let token: string | undefined;
  let total = 0;

  try {
    do {
      const list = await s3.send(
        new ListObjectsV2Command({ Bucket: r2Config.bucketName, ContinuationToken: token }),
      );
      const objects = list.Contents?.map((o) => ({ Key: o.Key! })) ?? [];

      if (objects.length > 0) {
        await s3.send(
          new DeleteObjectsCommand({ Bucket: r2Config.bucketName, Delete: { Objects: objects } }),
        );
        total += objects.length;
      }

      token = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (token);
  } catch (err) {
    const reason = (err as Error).message;
    throw new Error(
      `Não foi possível falar com o armazenamento de imagens em ${process.env.R2_ENDPOINT ?? '(endpoint padrão do R2)'} ` +
        `(bucket "${r2Config.bucketName}"): ${reason}\n` +
        `      Em desenvolvimento quem serve isso é o MinIO do docker-compose deste repositório.\n` +
        `      Rode "docker compose up -d" e espere o container minio_setup terminar — é ele que cria o bucket.\n` +
        `      Confira com: docker compose ps`,
    );
  }

  console.log(`      ✓ ${total} objetos removidos do R2`);
}

async function uploadToR2(
  s3: S3Client,
  r2Config: R2Config,
  propertyId: string,
  buffer: Buffer,
): Promise<string> {
  const compressed = await sharp(buffer)
    .rotate()
    .resize(1920, 1080, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const key = `${propertyId}/${Date.now()}-${randomUUID()}.jpg`;

  await s3.send(
    new PutObjectCommand({
      Bucket: r2Config.bucketName,
      Key: key,
      Body: compressed,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return `${r2Config.publicBaseUrl}/${key}`;
}

export async function seedProperties(
  prisma: PrismaClient,
  s3: S3Client,
  r2Config: R2Config,
  adminId: string,
): Promise<void> {
  console.log(`[4/6] Criando ${PROPERTIES.length} propriedades...`);

  for (let pi = 0; pi < PROPERTIES.length; pi++) {
    const def = PROPERTIES[pi];
    console.log(`\n  [${pi + 1}/${PROPERTIES.length}] ${def.type} – ${def.city}/${def.state}`);

    const property = await prisma.property.create({
      data: {
        code: generateCode(),
        user: { connect: { id: adminId } },
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
        ownerName: DEMO_OWNER_NAMES[pi % DEMO_OWNER_NAMES.length],
        ownerPhone: `1198800${String(1000 + pi).slice(-4)}`,
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

    const isPending = def.status === PropertyStatus.PENDING;

    for (let ri = 0; ri < def.rooms.length; ri++) {
      const roomName = def.rooms[ri];
      const room = await prisma.propertyRoom.create({
        data: { propertyId: property.id, name: roomName, order: ri },
      });

      if (isPending) {
        console.log(`         Sala "${roomName}" – sem fotos (imóvel pendente)`);
        continue;
      }

      console.log(`         Sala "${roomName}" – 5 imagens`);

      // `order` sai do índice, não da ordem de chegada, então paralelizar não
      // embaralha a galeria. O try/catch continua por foto: uma falha do picsum
      // custa uma imagem, nunca o seed inteiro.
      const limit = pLimit(PHOTO_DOWNLOAD_CONCURRENCY);

      await Promise.all(
        Array.from({ length: 5 }, (_, ii) =>
          limit(async () => {
            try {
              const imageIndex = pi * 20 + ri * 5 + ii;
              const buffer = await fetchBuffer(imageIndex);
              const url = await uploadToR2(s3, r2Config, property.id, buffer);
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
              console.warn(`\n         ⚠ Falha na imagem (#${ii}): ${(err as Error).message}`);
            }
          }),
        ),
      );

      process.stdout.write('\n');
    }
  }
}
