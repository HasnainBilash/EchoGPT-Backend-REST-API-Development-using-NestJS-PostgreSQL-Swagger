import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { PrismaService } from '../prisma/prisma.service';

class HealthResponse {
  @ApiProperty({ example: 'ok' })
  status: 'ok';

  @ApiProperty({ example: 'up' })
  database: 'up';

  @ApiProperty({ example: 3 })
  databaseLatencyMs: number;

  @ApiProperty({ example: 3600 })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  timestamp: string;
}

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Liveness / readiness probe',
    description:
      'Public endpoint for load balancers and container orchestrators. Checks DB connectivity.',
  })
  @ApiOkResponse({ type: HealthResponse })
  @ApiErrorResponses(503)
  async check(): Promise<HealthResponse> {
    try {
      const databaseLatencyMs = await this.prisma.ping();
      return {
        status: 'ok',
        database: 'up',
        databaseLatencyMs,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException('Database unreachable');
    }
  }
}
