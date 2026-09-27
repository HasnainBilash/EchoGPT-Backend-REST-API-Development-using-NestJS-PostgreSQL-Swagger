import 'dotenv/config';
import { PlanCode, PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Seeds reference data every environment needs: roles and subscription plans. Safe to run repeatedly. */
async function main() {
  await prisma.role.upsert({
    where: { name: RoleName.USER },
    update: {},
    create: { name: RoleName.USER, description: 'Regular extension user' },
  });
  await prisma.role.upsert({
    where: { name: RoleName.ADMIN },
    update: {},
    create: { name: RoleName.ADMIN, description: 'Platform administrator' },
  });

  await prisma.plan.upsert({
    where: { code: PlanCode.FREE },
    update: {},
    create: {
      code: PlanCode.FREE,
      name: 'Free',
      description: 'Get started with EchoGPT',
      priceCents: 0,
      dailyChatLimit: 20,
      dailySearchLimit: 10,
      allowStreaming: false,
    },
  });
  await prisma.plan.upsert({
    where: { code: PlanCode.PREMIUM },
    update: {},
    create: {
      code: PlanCode.PREMIUM,
      name: 'Premium',
      description: 'Higher limits and streaming responses',
      priceCents: 999,
      dailyChatLimit: 500,
      dailySearchLimit: 200,
      allowStreaming: true,
    },
  });

  console.log('Seeded roles and plans');

  await seedAdmin();
}

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD if set. Never overwrites an existing user. */
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin account');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin seed skipped: ${email} already exists`);
    return;
  }

  const [adminRole, premium] = await Promise.all([
    prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } }),
    prisma.plan.findUniqueOrThrow({ where: { code: PlanCode.PREMIUM } }),
  ]);
  await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      fullName: 'Administrator',
      roleId: adminRole.id,
      subscription: { create: { planId: premium.id } },
    },
  });
  console.log(`Seeded admin account ${email}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
