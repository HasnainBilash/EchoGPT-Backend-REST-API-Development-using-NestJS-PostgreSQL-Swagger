import { PlanCode, PrismaClient, RoleName } from '@prisma/client';

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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
