import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { PlanCode, SubscriptionStatus, UsageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';

const FREE = {
  id: 1,
  code: PlanCode.FREE,
  isActive: true,
  dailyChatLimit: 2,
  dailySearchLimit: null,
};
const PREMIUM = {
  id: 2,
  code: PlanCode.PREMIUM,
  isActive: true,
  dailyChatLimit: 500,
  dailySearchLimit: 200,
};

describe('Subscriptions & usage limits (smoke)', () => {
  let sub: Record<string, unknown>;
  let chatUsed: number;
  let prisma: Record<string, Record<string, jest.Mock>>;
  let subscriptions: SubscriptionsService;
  let usage: UsageService;

  const planById = (id: number) => (id === FREE.id ? FREE : PREMIUM);

  beforeEach(() => {
    chatUsed = 0;
    sub = {
      userId: 'u1',
      planId: FREE.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: null,
    };
    const withPlan = () => ({ ...sub, plan: planById(sub.planId as number) });
    prisma = {
      plan: {
        findUnique: jest.fn(({ where }: { where: { code: PlanCode } }) =>
          Promise.resolve(where.code === PlanCode.FREE ? FREE : PREMIUM),
        ),
      },
      subscription: {
        findUnique: jest.fn(() => Promise.resolve(withPlan())),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          Object.assign(sub, data);
          return Promise.resolve(withPlan());
        }),
      },
      usageRecord: {
        groupBy: jest.fn(() =>
          Promise.resolve([{ type: UsageType.CHAT, _count: { _all: chatUsed } }]),
        ),
        create: jest.fn(() => {
          chatUsed++;
          return Promise.resolve({});
        }),
      },
    };
    subscriptions = new SubscriptionsService(prisma as unknown as PrismaService);
    usage = new UsageService(prisma as unknown as PrismaService, subscriptions);
  });

  it('upgrades to Premium for 30 days, then refuses a second upgrade', async () => {
    const res = await subscriptions.upgrade('u1');

    expect(res.plan.code).toBe(PlanCode.PREMIUM);
    const days = (res.currentPeriodEnd!.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    await expect(subscriptions.upgrade('u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('downgrades to Free and refuses to downgrade twice', async () => {
    await subscriptions.upgrade('u1');
    const res = await subscriptions.downgrade('u1');

    expect(res).toMatchObject({
      status: SubscriptionStatus.CANCELED,
      plan: { code: PlanCode.FREE },
    });
    await expect(subscriptions.downgrade('u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('moves an expired Premium subscription back to Free when read', async () => {
    Object.assign(sub, { planId: PREMIUM.id, currentPeriodEnd: new Date(Date.now() - 1000) });

    const current = await subscriptions.getMine('u1');

    expect(current).toMatchObject({
      status: SubscriptionStatus.EXPIRED,
      plan: { code: PlanCode.FREE },
    });
  });

  it('allows requests until the daily limit, then throws 429', async () => {
    await usage.assertWithinLimit('u1', UsageType.CHAT);
    await usage.record('u1', UsageType.CHAT);
    await usage.assertWithinLimit('u1', UsageType.CHAT);
    await usage.record('u1', UsageType.CHAT);

    const blocked = usage.assertWithinLimit('u1', UsageType.CHAT);
    await expect(blocked).rejects.toBeInstanceOf(HttpException);
    await expect(blocked).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });

    const report = await usage.getUsage('u1');
    expect(report.chat).toEqual({ limit: 2, used: 2, remaining: 0 });
    // A null limit means unlimited.
    expect(report.search).toEqual({ limit: null, used: 0, remaining: null });
    await expect(usage.assertWithinLimit('u1', UsageType.SEARCH)).resolves.toBeUndefined();
  });
});
