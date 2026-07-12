import { S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedLocationCache } from './seeds/neighborhoods.seed';
import { cleanR2, seedProperties } from './seeds/properties.seed';
import { seedTest } from './seeds/test.seed';
import { seedUsers } from './seeds/users.seed';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// ─── DB cleanup (compartilhado entre dev e test) ──────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed bloqueado: NODE_ENV=production. Este script apaga todo o banco e o bucket R2 e nunca deve rodar em produção.',
    );
  }

  if (process.env.RUN_SEED !== 'true') {
    throw new Error(
      'Seed bloqueado: RUN_SEED não está definido como "true" no arquivo .env carregado. ' +
        'Isso é uma proteção extra contra execução acidental do seed.',
    );
  }

  console.log('🌱 Iniciando seed...\n');

  await cleanDatabase();

  if (process.env.NODE_ENV === 'test') {
    await seedTest(prisma);
  } else {
    const s3 = new S3Client({
      region: 'auto',
      endpoint:
        process.env.R2_ENDPOINT ?? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: !!process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    });
    const r2Config = {
      bucketName: process.env.R2_BUCKET_NAME!,
      publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, ''),
    };

    await cleanR2(s3, r2Config);
    const { adminId } = await seedUsers(prisma);
    await seedProperties(prisma, s3, r2Config, adminId);
    await seedLocationCache(prisma);
  }

  console.log('\n[6/6] Verificando contagens...');
  const [props, rooms, images, lc] = await Promise.all([
    prisma.property.count(),
    prisma.propertyRoom.count(),
    prisma.propertyImage.count(),
    prisma.locationCache.count(),
  ]);
  console.log(
    `      Property: ${props}  PropertyRoom: ${rooms}  PropertyImage: ${images}  LocationCache: ${lc}`,
  );
  console.log('\n✅ Seed concluído!\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed falhou:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
