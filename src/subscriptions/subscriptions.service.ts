import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Plan, PlanCode, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanDto, SubscriptionChangeDto, SubscriptionDto } from './dto/subscription.dto';

/** Length of one paid Premium period. There is no payment provider: upgrading grants one period. */
export const PREMIUM_PERIOD_DAYS = 30;

type SubscriptionWithPlan = Prisma.SubscriptionGetPayload<{ include: { plan: true } }>;

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPlans(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceCents: 'asc' },
    });
    return plans.map((p) => this.toPlan(p));
  }

  /**
   * The user's subscription as it is right now. An expired Premium period is switched back to Free
   * here, on read, so no scheduled job is needed.
   */
  async getCurrent(userId: string): Promise<SubscriptionWithPlan> {
    let sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { plan: true },
    });

    if (!sub) {
      // Every account gets one at registration; this only covers rows created some other way.
      const free = await this.getPlan(PlanCode.FREE);
      sub = await this.prisma.subscription.upsert({
        where: { userId },
        create: { userId, planId: free.id },
        update: {},
        include: { plan: true },
      });
    }

    const expired =
      sub.plan.code !== PlanCode.FREE &&
      sub.currentPeriodEnd !== null &&
      sub.currentPeriodEnd <= new Date();
    if (expired) {
      const free = await this.getPlan(PlanCode.FREE);
      sub = await this.prisma.subscription.update({
        where: { userId },
        data: {
          planId: free.id,
          status: SubscriptionStatus.EXPIRED,
          startedAt: sub.currentPeriodEnd!,
          currentPeriodEnd: null,
        },
        include: { plan: true },
      });
    }

    return sub;
  }

  async getMine(userId: string): Promise<SubscriptionDto> {
    return this.toSubscription(await this.getCurrent(userId));
  }

  async upgrade(userId: string): Promise<SubscriptionChangeDto> {
    const current = await this.getCurrent(userId);
    if (current.plan.code === PlanCode.PREMIUM) {
      throw new ConflictException(
        `Already on Premium until ${current.currentPeriodEnd?.toISOString().slice(0, 10)}`,
      );
    }

    const premium = await this.getPlan(PlanCode.PREMIUM);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + PREMIUM_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        planId: premium.id,
        status: SubscriptionStatus.ACTIVE,
        startedAt: now,
        currentPeriodEnd: periodEnd,
        canceledAt: null,
      },
      include: { plan: true },
    });

    return {
      ...this.toSubscription(updated),
      message: `Upgraded to Premium until ${periodEnd.toISOString().slice(0, 10)}`,
    };
  }

  /** Downgrades immediately (no refunds or pro-rating — there is no payment provider). */
  async downgrade(userId: string): Promise<SubscriptionChangeDto> {
    const current = await this.getCurrent(userId);
    if (current.plan.code === PlanCode.FREE) {
      throw new ConflictException('Already on the Free plan');
    }

    const free = await this.getPlan(PlanCode.FREE);
    const now = new Date();
    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        planId: free.id,
        status: SubscriptionStatus.CANCELED,
        startedAt: now,
        currentPeriodEnd: null,
        canceledAt: now,
      },
      include: { plan: true },
    });

    return { ...this.toSubscription(updated), message: 'Downgraded to the Free plan' };
  }

  private async getPlan(code: PlanCode): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { code } });
    if (!plan || !plan.isActive) {
      throw new ServiceUnavailableException(`The ${code} plan is not available right now`);
    }
    return plan;
  }

  toSubscription(sub: SubscriptionWithPlan): SubscriptionDto {
    return {
      status: sub.status,
      plan: this.toPlan(sub.plan),
      startedAt: sub.startedAt,
      currentPeriodEnd: sub.currentPeriodEnd,
      canceledAt: sub.canceledAt,
    };
  }

  private toPlan(plan: Plan): PlanDto {
    return {
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceCents: plan.priceCents,
      currency: plan.currency,
      dailyChatLimit: plan.dailyChatLimit,
      dailySearchLimit: plan.dailySearchLimit,
      allowStreaming: plan.allowStreaming,
    };
  }
}
