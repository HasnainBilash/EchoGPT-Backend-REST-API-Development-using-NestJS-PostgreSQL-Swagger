import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AdminService } from './admin.service';
import {
  AnalyticsQueryDto,
  RequestLogsQueryDto,
  SystemHealthQueryDto,
} from './dto/admin-query.dto';
import {
  DashboardDto,
  RequestAnalyticsDto,
  RequestLogPageDto,
  SystemHealthDto,
  UsageAnalyticsDto,
} from './dto/admin-response.dto';

@ApiTags('Admin · Dashboard & Monitoring')
@ApiBearerAuth('access-token')
@Roles(RoleName.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard statistics (admin)',
    description:
      "Users, plans, today's usage, content totals, providers and last-24h request stats.",
  })
  @ApiOkResponse({ type: DashboardDto })
  @ApiErrorResponses(401, 403)
  dashboard(): Promise<DashboardDto> {
    return this.admin.dashboard();
  }

  @Get('analytics/usage')
  @ApiOperation({
    summary: 'API usage analytics (admin)',
    description: 'Chats, searches and tokens per day, usage per AI provider, and the top 10 users.',
  })
  @ApiOkResponse({ type: UsageAnalyticsDto })
  @ApiErrorResponses(400, 401, 403)
  usageAnalytics(@Query() query: AnalyticsQueryDto): Promise<UsageAnalyticsDto> {
    return this.admin.usageAnalytics(query.days);
  }

  @Get('analytics/requests')
  @ApiOperation({
    summary: 'HTTP request analytics (admin)',
    description:
      'Requests, errors and average latency per day, the busiest endpoints and status codes.',
  })
  @ApiOkResponse({ type: RequestAnalyticsDto })
  @ApiErrorResponses(400, 401, 403)
  requestAnalytics(@Query() query: AnalyticsQueryDto): Promise<RequestAnalyticsDto> {
    return this.admin.requestAnalytics(query.days);
  }

  @Get('request-logs')
  @ApiOperation({
    summary: 'Request logs (admin)',
    description:
      'Every API request, newest first. Filter by user, method, status, path or time range.',
  })
  @ApiOkResponse({ type: RequestLogPageDto })
  @ApiErrorResponses(400, 401, 403)
  requestLogs(@Query() query: RequestLogsQueryDto): Promise<RequestLogPageDto> {
    return this.admin.requestLogs(query);
  }

  @Get('system/health')
  @ApiOperation({
    summary: 'System health (admin)',
    description:
      'Database, runtime (uptime, memory) and AI provider health. `refreshProviders=true` runs a ' +
      'live check on every enabled provider first.',
  })
  @ApiOkResponse({ type: SystemHealthDto })
  @ApiErrorResponses(400, 401, 403)
  systemHealth(@Query() query: SystemHealthQueryDto): Promise<SystemHealthDto> {
    return this.admin.systemHealth(query.refreshProviders);
  }
}
