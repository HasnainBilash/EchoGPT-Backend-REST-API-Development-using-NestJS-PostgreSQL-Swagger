import { ApiProperty } from '@nestjs/swagger';
import { AiProviderType, HealthStatus, PlanCode, SubscriptionStatus } from '@prisma/client';
import { PageMetaDto } from '../../common/dto/pagination.dto';
import { UserProfileDto } from '../../users/dto/user-profile.dto';

// ─── Dashboard ───────────────────────────────────────────────────────────────

class DashboardUsersDto {
  @ApiProperty({ example: 120 }) total: number;
  @ApiProperty({ example: 115 }) active: number;
  @ApiProperty({ example: 5 }) inactive: number;
  @ApiProperty({ example: 2 }) admins: number;
  @ApiProperty({ example: 4 }) newToday: number;
  @ApiProperty({ example: 21 }) newLast7Days: number;
}

class DashboardSubscriptionsDto {
  @ApiProperty({ example: 100 }) free: number;
  @ApiProperty({ example: 20 }) premium: number;
}

class DashboardUsageDto {
  @ApiProperty({ example: 340 }) chats: number;
  @ApiProperty({ example: 95 }) searches: number;
  @ApiProperty({ example: 120000 }) promptTokens: number;
  @ApiProperty({ example: 45000 }) completionTokens: number;
}

class DashboardContentDto {
  @ApiProperty({ example: 800 }) conversations: number;
  @ApiProperty({ example: 5200 }) messages: number;
  @ApiProperty({ example: 1300 }) searches: number;
}

class DashboardProvidersDto {
  @ApiProperty({ example: 3 }) total: number;
  @ApiProperty({ example: 2 }) enabled: number;
  @ApiProperty({ example: 2 }) healthy: number;
  @ApiProperty({ example: 0 }) unhealthy: number;
  @ApiProperty({ example: 1 }) unknown: number;
}

class DashboardRequestsDto {
  @ApiProperty({ example: 5400 }) total: number;
  @ApiProperty({ example: 120, description: '4xx responses' }) clientErrors: number;
  @ApiProperty({ example: 3, description: '5xx responses' }) serverErrors: number;
  @ApiProperty({ example: 48 }) avgDurationMs: number;
}

export class DashboardDto {
  @ApiProperty({ type: DashboardUsersDto }) users: DashboardUsersDto;
  @ApiProperty({ type: DashboardSubscriptionsDto }) subscriptions: DashboardSubscriptionsDto;
  @ApiProperty({ type: DashboardUsageDto, description: 'Since 00:00 UTC today.' })
  usageToday: DashboardUsageDto;
  @ApiProperty({ type: DashboardContentDto }) content: DashboardContentDto;
  @ApiProperty({ type: DashboardProvidersDto }) providers: DashboardProvidersDto;
  @ApiProperty({ type: DashboardRequestsDto }) requestsLast24h: DashboardRequestsDto;
  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' }) generatedAt: Date;
}

// ─── Users & subscriptions ───────────────────────────────────────────────────

export class AdminUserDto extends UserProfileDto {
  @ApiProperty({ enum: PlanCode, example: PlanCode.FREE, nullable: true })
  plan: PlanCode | null;

  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE, nullable: true })
  subscriptionStatus: SubscriptionStatus | null;
}

class AdminUserStatsDto {
  @ApiProperty({ example: 12 }) conversations: number;
  @ApiProperty({ example: 30 }) searches: number;
  @ApiProperty({ example: 2 }) activeSessions: number;
  @ApiProperty({ example: 5 }) chatsToday: number;
  @ApiProperty({ example: 1 }) searchesToday: number;
}

export class AdminUserDetailDto extends AdminUserDto {
  @ApiProperty({ example: '2026-10-28T10:00:00.000Z', nullable: true, type: Date })
  currentPeriodEnd: Date | null;

  @ApiProperty({ type: AdminUserStatsDto }) stats: AdminUserStatsDto;
}

export class AdminUserPageDto {
  @ApiProperty({ type: AdminUserDto, isArray: true }) items: AdminUserDto[];
  @ApiProperty({ type: PageMetaDto }) meta: PageMetaDto;
}

export class AdminSubscriptionDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' }) userId: string;
  @ApiProperty({ example: 'jane@example.com' }) email: string;
  @ApiProperty({ enum: PlanCode, example: PlanCode.PREMIUM }) plan: PlanCode;
  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;
  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' }) startedAt: Date;
  @ApiProperty({ example: '2026-10-28T10:00:00.000Z', nullable: true, type: Date })
  currentPeriodEnd: Date | null;
  @ApiProperty({ example: null, nullable: true, type: Date }) canceledAt: Date | null;
}

export class AdminSubscriptionPageDto {
  @ApiProperty({ type: AdminSubscriptionDto, isArray: true }) items: AdminSubscriptionDto[];
  @ApiProperty({ type: PageMetaDto }) meta: PageMetaDto;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

class DailyUsageDto {
  @ApiProperty({ example: '2026-09-28' }) date: string;
  @ApiProperty({ example: 40 }) chats: number;
  @ApiProperty({ example: 12 }) searches: number;
  @ApiProperty({ example: 15000 }) promptTokens: number;
  @ApiProperty({ example: 6000 }) completionTokens: number;
}

class ProviderUsageDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f', nullable: true, type: String })
  providerId: string | null;
  @ApiProperty({
    example: 'OpenAI',
    description: '"(deleted provider)", or "(no AI provider)" for searches without a summary.',
  })
  name: string;
  @ApiProperty({ example: 120 }) requests: number;
  @ApiProperty({ example: 50000 }) promptTokens: number;
  @ApiProperty({ example: 20000 }) completionTokens: number;
}

class TopUserDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' }) userId: string;
  @ApiProperty({ example: 'jane@example.com' }) email: string;
  @ApiProperty({ example: 55 }) chats: number;
  @ApiProperty({ example: 10 }) searches: number;
}

export class UsageAnalyticsDto {
  @ApiProperty({ example: 7 }) days: number;
  @ApiProperty({ example: '2026-09-22T00:00:00.000Z' }) from: Date;
  @ApiProperty({
    type: DailyUsageDto,
    isArray: true,
    description: 'One row per UTC day, oldest first.',
  })
  daily: DailyUsageDto[];
  @ApiProperty({ type: ProviderUsageDto, isArray: true }) byProvider: ProviderUsageDto[];
  @ApiProperty({ type: TopUserDto, isArray: true, description: 'Top 10 users by requests.' })
  topUsers: TopUserDto[];
}

class DailyRequestsDto {
  @ApiProperty({ example: '2026-09-28' }) date: string;
  @ApiProperty({ example: 800 }) requests: number;
  @ApiProperty({ example: 20 }) clientErrors: number;
  @ApiProperty({ example: 1 }) serverErrors: number;
  @ApiProperty({ example: 45 }) avgDurationMs: number;
}

class TopRouteDto {
  @ApiProperty({ example: 'POST' }) method: string;
  @ApiProperty({ example: '/api/v1/chat/messages' }) route: string;
  @ApiProperty({ example: 300 }) requests: number;
  @ApiProperty({ example: 820 }) avgDurationMs: number;
  @ApiProperty({ example: 2 }) errors: number;
}

class StatusCountDto {
  @ApiProperty({ example: 200 }) statusCode: number;
  @ApiProperty({ example: 4200 }) count: number;
}

export class RequestAnalyticsDto {
  @ApiProperty({ example: 7 }) days: number;
  @ApiProperty({ example: '2026-09-22T00:00:00.000Z' }) from: Date;
  @ApiProperty({ type: DailyRequestsDto, isArray: true }) daily: DailyRequestsDto[];
  @ApiProperty({ type: TopRouteDto, isArray: true, description: 'Top 10 endpoints by traffic.' })
  topRoutes: TopRouteDto[];
  @ApiProperty({ type: StatusCountDto, isArray: true }) statusCodes: StatusCountDto[];
}

// ─── Request logs & system health ────────────────────────────────────────────

export class RequestLogDto {
  @ApiProperty({ example: '1042', description: 'Numeric id as a string (64-bit).' }) id: string;
  @ApiProperty({ example: 'POST' }) method: string;
  @ApiProperty({ example: '/api/v1/chat/messages' }) path: string;
  @ApiProperty({ example: '/api/v1/chat/messages', nullable: true, type: String }) route:
    string | null;
  @ApiProperty({ example: 200 }) statusCode: number;
  @ApiProperty({ example: 812 }) durationMs: number;
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f', nullable: true, type: String })
  userId: string | null;
  @ApiProperty({ example: 'jane@example.com', nullable: true, type: String }) userEmail:
    string | null;
  @ApiProperty({ example: '127.0.0.1', nullable: true, type: String }) ipAddress: string | null;
  @ApiProperty({ example: 'Mozilla/5.0 …', nullable: true, type: String }) userAgent: string | null;
  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' }) createdAt: Date;
}

export class RequestLogPageDto {
  @ApiProperty({ type: RequestLogDto, isArray: true }) items: RequestLogDto[];
  @ApiProperty({ type: PageMetaDto }) meta: PageMetaDto;
}

class SystemDatabaseDto {
  @ApiProperty({ enum: ['up', 'down'], example: 'up' }) status: 'up' | 'down';
  @ApiProperty({ example: 2, nullable: true, type: Number }) latencyMs: number | null;
}

class SystemRuntimeDto {
  @ApiProperty({ example: 'v22.17.1' }) nodeVersion: string;
  @ApiProperty({ example: 'development' }) environment: string;
  @ApiProperty({ example: 3600 }) uptimeSeconds: number;
  @ApiProperty({ example: 120, description: 'Resident memory in MB.' }) memoryRssMb: number;
  @ApiProperty({ example: 60 }) heapUsedMb: number;
}

class SystemProviderDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' }) id: string;
  @ApiProperty({ example: 'OpenAI' }) name: string;
  @ApiProperty({ enum: AiProviderType }) type: AiProviderType;
  @ApiProperty({ example: true }) isEnabled: boolean;
  @ApiProperty({ example: true }) isDefault: boolean;
  @ApiProperty({ enum: HealthStatus }) health: HealthStatus;
  @ApiProperty({ example: 'OK', nullable: true, type: String }) message: string | null;
  @ApiProperty({ example: 310, nullable: true, type: Number }) latencyMs: number | null;
  @ApiProperty({ example: '2026-09-28T10:00:00.000Z', nullable: true, type: Date })
  checkedAt: Date | null;
}

export class SystemHealthDto {
  @ApiProperty({
    enum: ['ok', 'degraded', 'down'],
    example: 'ok',
    description:
      'down = database unreachable; degraded = an enabled provider is unhealthy or none is enabled.',
  })
  status: 'ok' | 'degraded' | 'down';
  @ApiProperty({ type: SystemDatabaseDto }) database: SystemDatabaseDto;
  @ApiProperty({ type: SystemRuntimeDto }) runtime: SystemRuntimeDto;
  @ApiProperty({ type: SystemProviderDto, isArray: true }) providers: SystemProviderDto[];
  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' }) checkedAt: Date;
}
