import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { UsageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsageCounterDto, UsageDto } from './dto/usage.dto';
import { SubscriptionsService } from './subscriptions.service';

export interface UsageDetails {
  providerId?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Daily plan limits. Chat and search call `assertWithinLimit` before doing the work and `record`
 * after it succeeds, so failed requests never use up quota.
 */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async getUsage(userId: string): Promise<UsageDto> {
    const { plan } = await this.subscriptions.getCurrent(userId);
    const periodStart = startOfUtcDay();

    const counts = await this.prisma.usageRecord.groupBy({
      by: ['type'],
      where: { userId, createdAt: { gte: periodStart } },
      _count: { _all: true },
    });
    const used = (type: UsageType) => counts.find((c) => c.type === type)?._count._all ?? 0;

    return {
      plan: plan.code,
      periodStart,
      resetsAt: new Date(periodStart.getTime() + DAY_MS),
      chat: counter(plan.dailyChatLimit, used(UsageType.CHAT)),
      search: counter(plan.dailySearchLimit, used(UsageType.SEARCH)),
    };
  }

  /** Throws 429 when today's quota for this request type is used up. */
  async assertWithinLimit(userId: string, type: UsageType): Promise<void> {
    const usage = await this.getUsage(userId);
    const counterForType = type === UsageType.CHAT ? usage.chat : usage.search;

    if (counterForType.remaining !== null && counterForType.remaining <= 0) {
      const label = type === UsageType.CHAT ? 'chat' : 'search';
      throw new HttpException(
        `Daily ${label} limit reached (${counterForType.used}/${counterForType.limit}). ` +
          `Resets at ${usage.resetsAt.toISOString()}.` +
          (usage.plan === 'FREE' ? ' Upgrade to Premium for higher limits.' : ''),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async record(userId: string, type: UsageType, details: UsageDetails = {}): Promise<void> {
    await this.prisma.usageRecord.create({ data: { userId, type, ...details } });
  }
}

function startOfUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function counter(limit: number | null, used: number): UsageCounterDto {
  return { limit, used, remaining: limit === null ? null : Math.max(limit - used, 0) };
}
