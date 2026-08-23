import {
  BusinessType,
  PrismaClient,
  PropertyStatus,
  PropertyType,
  SaleType,
  Topography,
  Zoning,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

/**
 * Dataset mínimo e determinístico para os testes automatizados (unit/E2E).
 * Sem chamadas de rede (sem picsum.photos, sem geocodificação real) — deve
 * rodar rápido e de forma idêntica em qualquer ambiente, incluindo CI.
 */
export async function seedTest(prisma: PrismaClient): Promise<void> {
  console.log('[3/3] Criando dataset mínimo de teste...');

  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      password: await bcrypt.hash('Test@1234', 10),
      name: 'Test User',
    },
  });

  const neighborhood = await prisma.neighborhood.upsert({
    where: { slug_city_state: { slug: 'centro', city: 'São Paulo', state: 'SP' } },
    update: {},
    create: { slug: 'centro', displayName: 'Centro', city: 'São Paulo', state: 'SP' },
  });

  // Property A — ACTIVE, com quarto e 1 imagem (URL fake, sem upload real)
  const propertyA = await prisma.property.create({
    data: {
      code: '000001',
      user: { connect: { id: user.id } },
      neighborhood: { connect: { id: neighborhood.id } },
      type: PropertyType.HOUSE,
      businessType: BusinessType.SALE,
      status: PropertyStatus.ACTIVE,
      price: '500000.00',
      description: 'Casa de teste com imagem — usada em specs E2E',
      // Só este imóvel tem proprietário: os outros dois cobrem o caso das linhas anteriores
      // à migração, em que `owner` volta null mesmo para quem está autenticado.
      ownerName: 'Maria Proprietária',
      ownerPhone: '11987654321',
      house: { create: { floors: 1, isInCondominium: false } },
      saleTypes: { create: [{ type: SaleType.DIRECT }] },
    },
  });
  const roomA = await prisma.propertyRoom.create({
    data: { propertyId: propertyA.id, name: 'Sala de Estar', order: 0 },
  });
  await prisma.propertyImage.create({
    data: {
      propertyId: propertyA.id,
      roomId: roomA.id,
      url: 'https://placeholder.test/fake.jpg',
      order: 0,
    },
  });

  // Property B — PENDING, com quarto mas sem imagens (estado inicial padrão)
  const propertyB = await prisma.property.create({
    data: {
      code: '000002',
      user: { connect: { id: user.id } },
      neighborhood: { connect: { id: neighborhood.id } },
      type: PropertyType.APARTMENT,
      businessType: BusinessType.RENT,
      status: PropertyStatus.PENDING,
      rentPrice: '2000.00',
      description: 'Apartamento de teste pendente — sem fotos',
      apartment: {
        create: {
          floor: 3,
          isGroundFloor: false,
          hasElevator: true,
          hasBalcony: false,
          sunPosition: 'MORNING',
        },
      },
    },
  });
  await prisma.propertyRoom.create({
    data: { propertyId: propertyB.id, name: 'Sala de Estar', order: 0 },
  });

  // Property C — INACTIVE, sem quartos/imagens (exercita reativação inteligente)
  await prisma.property.create({
    data: {
      code: '000003',
      user: { connect: { id: user.id } },
      neighborhood: { connect: { id: neighborhood.id } },
      type: PropertyType.LAND,
      businessType: BusinessType.SALE,
      status: PropertyStatus.INACTIVE,
      price: '100000.00',
      description: 'Terreno de teste inativo — usado em testes de reativação',
      land: { create: { zoning: Zoning.RESIDENTIAL, topography: Topography.FLAT } },
      saleTypes: { create: [{ type: SaleType.DIRECT }] },
    },
  });

  console.log('      ✓ 1 usuário, 1 bairro, 3 propriedades (ACTIVE/PENDING/INACTIVE)');
}
