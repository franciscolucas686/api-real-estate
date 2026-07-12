import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export async function seedUsers(prisma: PrismaClient): Promise<{ adminId: string }> {
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
  return { adminId: user.id };
}
