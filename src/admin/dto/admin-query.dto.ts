import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanCode, RoleName, SubscriptionStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Query strings arrive as text: turn "true"/"false" into booleans. */
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class AdminUsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'jane',
    description: 'Matches email or name (case-insensitive).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: RoleName })
  @IsOptional()
  @IsEnum(RoleName)
  role?: RoleName;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}

export class SetUserStatusDto {
  @ApiProperty({
    example: false,
    description: 'false = deactivate (signs the user out everywhere).',
  })
  @IsBoolean()
  isActive: boolean;
}

export class AdminSubscriptionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PlanCode })
  @IsOptional()
  @IsEnum(PlanCode)
  plan?: PlanCode;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class SetPlanDto {
  @ApiProperty({ enum: PlanCode, example: PlanCode.PREMIUM })
  @IsEnum(PlanCode)
  plan: PlanCode;

  @ApiPropertyOptional({
    example: 30,
    default: 30,
    description: 'Length of the paid period in days (ignored for FREE).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  periodDays?: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional({ example: 'Premium' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ example: 'Higher limits', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 999, description: 'Price in cents.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional({ example: 500, nullable: true, description: 'null = unlimited' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  dailyChatLimit?: number | null;

  @ApiPropertyOptional({ example: 200, nullable: true, description: 'null = unlimited' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  dailySearchLimit?: number | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  allowStreaming?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Inactive plans cannot be subscribed to.' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    example: 7,
    default: 7,
    minimum: 1,
    maximum: 90,
    description: 'Days back from today (UTC).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days = 7;
}

export class RequestLogsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] })
  @IsOptional()
  @IsIn(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
  method?: string;

  @ApiPropertyOptional({ example: 404, description: 'Exact status code.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  statusCode?: number;

  @ApiPropertyOptional({
    example: 400,
    description: 'Only responses with status >= this (e.g. 400 = errors only).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(599)
  minStatus?: number;

  @ApiPropertyOptional({ example: '/chat', description: 'Path contains this text.' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;

  @ApiPropertyOptional({ example: '2026-09-28T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-29T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SystemHealthQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: false,
    description: 'Run a live health check on every enabled provider first (slower).',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  refreshProviders?: boolean;
}
