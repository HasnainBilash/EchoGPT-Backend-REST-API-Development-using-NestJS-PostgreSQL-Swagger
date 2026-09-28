import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthStatus, PlanCode, Prisma, RoleName, UsageType } from '@prisma/client';
import { pageMeta } from '../common/dto/pagination.dto';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { startOfUtcDay } from '../subscriptions/usage.service';
import {
  AdminSubscriptionsQueryDto,
  AdminUsersQueryDto,
  RequestLogsQueryDto,
} from './dto/admin-query.dto';
import {
  AdminSubscriptionPageDto,
  AdminUserDetailDto,
  AdminUserDto,
  AdminUserPageDto,
  DashboardDto,
  RequestAnalyticsDto,
  RequestLogPageDto,
  SystemHealthDto,
  UsageAnalyticsDto,
} from './dto/admin-response.dto';

const DAY_MS = 86_400_000;

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  isActive: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true } },
  subscription: {
    select: { status: true, currentPeriodEnd: true, plan: { select: { code: true } } },
  },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof ADMIN_USER_SELECT }>;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async dashboard(): Promise<DashboardDto> {
    const today = startOfUtcDay();
    const weekAgo = new Date(today.getTime() - 6 * DAY_MS);
    const dayAgo = new Date(Date.now() - DAY_MS);

    const [
      totalUsers,
      activeUsers,
      admins,
      newToday,
      newLast7Days,
      premium,
      usageToday,
      conversations,
      messages,
      searches,
      providers,
      requests,
      clientErrors,
      serverErrors,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { role: { name: RoleName.ADMIN } } }),
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.subscription.count({ where: { plan: { code: PlanCode.PREMIUM } } }),
      this.prisma.usageRecord.groupBy({
        by: ['type'],
        where: { createdAt: { gte: today } },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
        orderBy: { type: 'asc' },
      }),
      this.prisma.conversation.count(),
      this.prisma.message.count(),
      this.prisma.webSearch.count(),
      this.prisma.aiProvider.findMany({ select: { isEnabled: true, healthStatus: true } }),
      this.prisma.apiUsageLog.aggregate({
        where: { createdAt: { gte: dayAgo } },
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
      this.prisma.apiUsageLog.count({
        where: { createdAt: { gte: dayAgo }, statusCode: { gte: 400, lt: 500 } },
      }),
      this.prisma.apiUsageLog.count({
        where: { createdAt: { gte: dayAgo }, statusCode: { gte: 500 } },
      }),
    ]);

    const usageOf = (type: UsageType) => usageToday.find((u) => u.type === type);
    const sum = (key: 'promptTokens' | 'completionTokens') =>
      usageToday.reduce((n, u) => n + (u._sum?.[key] ?? 0), 0);
    const countOf = (type: UsageType) => {
      const count = usageOf(type)?._count;
      return typeof count === 'object' ? (count._all ?? 0) : 0;
    };

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        admins,
        newToday,
        newLast7Days,
      },
      subscriptions: { free: totalUsers - premium, premium },
      usageToday: {
        chats: countOf(UsageType.CHAT),
        searches: countOf(UsageType.SEARCH),
        promptTokens: sum('promptTokens'),
        completionTokens: sum('completionTokens'),
      },
      content: { conversations, messages, searches },
      providers: {
        total: providers.length,
        enabled: providers.filter((p) => p.isEnabled).length,
        healthy: providers.filter((p) => p.healthStatus === HealthStatus.HEALTHY).length,
        unhealthy: providers.filter((p) => p.healthStatus === HealthStatus.UNHEALTHY).length,
        unknown: providers.filter((p) => p.healthStatus === HealthStatus.UNKNOWN).length,
      },
      requestsLast24h: {
        total: requests._count._all,
        clientErrors,
        serverErrors,
        avgDurationMs: Math.round(requests._avg.durationMs ?? 0),
      },
      generatedAt: new Date(),
    };
  }

  async listUsers(query: AdminUsersQueryDto): Promise<AdminUserPageDto> {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: { name: query.role } } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' } },
              { fullName: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: ADMIN_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toAdminUser), meta: pageMeta(query, total) };
  }

  async getUser(id: string): Promise<AdminUserDetailDto> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const today = startOfUtcDay();
    const [conversations, searches, activeSessions, chatsToday, searchesToday] =
      await this.prisma.$transaction([
        this.prisma.conversation.count({ where: { userId: id } }),
        this.prisma.webSearch.count({ where: { userId: id } }),
        this.prisma.session.count({
          where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
        }),
        this.prisma.usageRecord.count({
          where: { userId: id, type: UsageType.CHAT, createdAt: { gte: today } },
        }),
        this.prisma.usageRecord.count({
          where: { userId: id, type: UsageType.SEARCH, createdAt: { gte: today } },
        }),
      ]);
    return {
      ...toAdminUser(user),
      currentPeriodEnd: user.subscription?.currentPeriodEnd ?? null,
      stats: { conversations, searches, activeSessions, chatsToday, searchesToday },
    };
  }

  async listSubscriptions(query: AdminSubscriptionsQueryDto): Promise<AdminSubscriptionPageDto> {
    const where: Prisma.SubscriptionWhereInput = {
      ...(query.plan ? { plan: { code: query.plan } } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.subscription.findMany({
        where,
        include: { plan: { select: { code: true } }, user: { select: { email: true } } },
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.subscription.count({ where }),
    ]);
    return {
      items: rows.map((s) => ({
        userId: s.userId,
        email: s.user.email,
        plan: s.plan.code,
        status: s.status,
        startedAt: s.startedAt,
        currentPeriodEnd: s.currentPeriodEnd,
        canceledAt: s.canceledAt,
      })),
      meta: pageMeta(query, total),
    };
  }

  async usageAnalytics(days: number): Promise<UsageAnalyticsDto> {
    const from = new Date(startOfUtcDay().getTime() - (days - 1) * DAY_MS);

    const [daily, byProvider, topUsers] = await Promise.all([
      this.prisma.$queryRaw<
        { date: string; chats: number; searches: number; prompt: number; completion: number }[]
      >(Prisma.sql`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
               count(*) FILTER (WHERE type = 'CHAT')::int   AS chats,
               count(*) FILTER (WHERE type = 'SEARCH')::int AS searches,
               coalesce(sum(prompt_tokens), 0)::int         AS prompt,
               coalesce(sum(completion_tokens), 0)::int     AS completion
        FROM usage_records
        WHERE created_at >= ${from}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.usageRecord.groupBy({
        by: ['providerId'],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true },
      }),
      this.prisma.$queryRaw<{ userId: string; email: string; chats: number; searches: number }[]>(
        Prisma.sql`
        SELECT u.id AS "userId", u.email,
               count(*) FILTER (WHERE r.type = 'CHAT')::int   AS chats,
               count(*) FILTER (WHERE r.type = 'SEARCH')::int AS searches
        FROM usage_records r JOIN users u ON u.id = r.user_id
        WHERE r.created_at >= ${from}
        GROUP BY u.id, u.email
        ORDER BY count(*) DESC
        LIMIT 10`,
      ),
    ]);

    const providerIds = byProvider.map((p) => p.providerId).filter((id): id is string => !!id);
    const names = new Map(
      (
        await this.prisma.aiProvider.findMany({
          where: { id: { in: providerIds } },
          select: { id: true, name: true },
        })
      ).map((p) => [p.id, p.name]),
    );

    const byDate = new Map(daily.map((d) => [d.date, d]));
    return {
      days,
      from,
      daily: eachDay(from, days).map((date) => {
        const row = byDate.get(date);
        return {
          date,
          chats: row?.chats ?? 0,
          searches: row?.searches ?? 0,
          promptTokens: row?.prompt ?? 0,
          completionTokens: row?.completion ?? 0,
        };
      }),
      byProvider: byProvider
        .map((p) => ({
          providerId: p.providerId,
          name: p.providerId
            ? (names.get(p.providerId) ?? '(deleted provider)')
            : '(no AI provider)',
          requests: p._count._all,
          promptTokens: p._sum.promptTokens ?? 0,
          completionTokens: p._sum.completionTokens ?? 0,
        }))
        .sort((a, b) => b.requests - a.requests),
      topUsers,
    };
  }

  async requestAnalytics(days: number): Promise<RequestAnalyticsDto> {
    const from = new Date(startOfUtcDay().getTime() - (days - 1) * DAY_MS);

    const [daily, topRoutes, statusCodes] = await Promise.all([
      this.prisma.$queryRaw<
        { date: string; requests: number; client: number; server: number; avg: number }[]
      >(Prisma.sql`
        SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS date,
               count(*)::int                                                   AS requests,
               count(*) FILTER (WHERE status_code BETWEEN 400 AND 499)::int    AS client,
               count(*) FILTER (WHERE status_code >= 500)::int                 AS server,
               round(avg(duration_ms))::int                                    AS avg
        FROM api_usage_logs
        WHERE created_at >= ${from}
        GROUP BY 1 ORDER BY 1`),
      this.prisma.$queryRaw<
        { method: string; route: string; requests: number; avg: number; errors: number }[]
      >(Prisma.sql`
        SELECT method, coalesce(route, path) AS route,
               count(*)::int                                     AS requests,
               round(avg(duration_ms))::int                      AS avg,
               count(*) FILTER (WHERE status_code >= 400)::int   AS errors
        FROM api_usage_logs
        WHERE created_at >= ${from}
        GROUP BY 1, 2
        ORDER BY requests DESC
        LIMIT 10`),
      this.prisma.apiUsageLog.groupBy({
        by: ['statusCode'],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
        orderBy: { statusCode: 'asc' },
      }),
    ]);

    const byDate = new Map(daily.map((d) => [d.date, d]));
    return {
      days,
      from,
      daily: eachDay(from, days).map((date) => {
        const row = byDate.get(date);
        return {
          date,
          requests: row?.requests ?? 0,
          clientErrors: row?.client ?? 0,
          serverErrors: row?.server ?? 0,
          avgDurationMs: row?.avg ?? 0,
        };
      }),
      topRoutes: topRoutes.map((r) => ({
        method: r.method,
        route: r.route,
        requests: r.requests,
        avgDurationMs: r.avg,
        errors: r.errors,
      })),
      statusCodes: statusCodes.map((s) => ({
        statusCode: s.statusCode,
        count: typeof s._count === 'object' ? (s._count._all ?? 0) : 0,
      })),
    };
  }

  async requestLogs(query: RequestLogsQueryDto): Promise<RequestLogPageDto> {
    const statusFilter: Prisma.IntFilter | undefined =
      query.statusCode !== undefined
        ? { equals: query.statusCode }
        : query.minStatus !== undefined
          ? { gte: query.minStatus }
          : undefined;
    const where: Prisma.ApiUsageLogWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(statusFilter ? { statusCode: statusFilter } : {}),
      ...(query.path ? { path: { contains: query.path, mode: 'insensitive' } } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lt: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.apiUsageLog.findMany({
        where,
        include: { user: { select: { email: true } } },
        orderBy: { id: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.apiUsageLog.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id.toString(),
        method: r.method,
        path: r.path,
        route: r.route,
        statusCode: r.statusCode,
        durationMs: r.durationMs,
        userId: r.userId,
        userEmail: r.user?.email ?? null,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        createdAt: r.createdAt,
      })),
      meta: pageMeta(query, total),
    };
  }

  async systemHealth(refreshProviders = false): Promise<SystemHealthDto> {
    let database: SystemHealthDto['database'];
    try {
      database = { status: 'up', latencyMs: await this.prisma.ping() };
    } catch {
      database = { status: 'down', latencyMs: null };
    }

    if (refreshProviders && database.status === 'up') {
      const enabled = await this.prisma.aiProvider.findMany({
        where: { isEnabled: true },
        select: { id: true },
      });
      // Each check already records its own result; one failing must not stop the others.
      await Promise.allSettled(enabled.map((p) => this.providers.checkHealth(p.id)));
    }

    const providers =
      database.status === 'up'
        ? await this.prisma.aiProvider.findMany({
            orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          })
        : [];
    const enabled = providers.filter((p) => p.isEnabled);
    const status =
      database.status === 'down'
        ? 'down'
        : enabled.length === 0 || enabled.some((p) => p.healthStatus === HealthStatus.UNHEALTHY)
          ? 'degraded'
          : 'ok';

    const memory = process.memoryUsage();
    return {
      status,
      database,
      runtime: {
        nodeVersion: process.version,
        environment: this.config.get('nodeEnv', { infer: true }),
        uptimeSeconds: Math.round(process.uptime()),
        memoryRssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
      },
      providers: providers.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        isEnabled: p.isEnabled,
        isDefault: p.isDefault,
        health: p.healthStatus,
        message: p.healthMessage,
        latencyMs: p.healthLatencyMs,
        checkedAt: p.lastHealthCheckAt,
      })),
      checkedAt: new Date(),
    };
  }
}

function toAdminUser(user: AdminUserRow): AdminUserDto {
  const { role, subscription, ...rest } = user;
  return {
    ...rest,
    role: role.name,
    plan: subscription?.plan.code ?? null,
    subscriptionStatus: subscription?.status ?? null,
  };
}

/** 'YYYY-MM-DD' for each UTC day starting at `from`. */
function eachDay(from: Date, days: number): string[] {
  return Array.from({ length: days }, (_, i) =>
    new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10),
  );
}
