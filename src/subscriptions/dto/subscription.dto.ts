import { ApiProperty } from '@nestjs/swagger';
import { PlanCode, SubscriptionStatus } from '@prisma/client';

export class PlanDto {
  @ApiProperty({ enum: PlanCode, example: PlanCode.PREMIUM })
  code: PlanCode;

  @ApiProperty({ example: 'Premium' })
  name: string;

  @ApiProperty({ example: 'Higher limits and streaming responses', nullable: true, type: String })
  description: string | null;

  @ApiProperty({ example: 999, description: 'Price per 30-day period, in cents.' })
  priceCents: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    example: 500,
    nullable: true,
    type: Number,
    description: 'Chat requests per UTC day. null = unlimited.',
  })
  dailyChatLimit: number | null;

  @ApiProperty({
    example: 200,
    nullable: true,
    type: Number,
    description: 'Web searches per UTC day. null = unlimited.',
  })
  dailySearchLimit: number | null;

  @ApiProperty({ example: true })
  allowStreaming: boolean;
}

export class SubscriptionDto {
  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status: SubscriptionStatus;

  @ApiProperty({ type: PlanDto })
  plan: PlanDto;

  @ApiProperty({
    example: '2026-09-28T10:00:00.000Z',
    description: 'When the current plan started.',
  })
  startedAt: Date;

  @ApiProperty({
    example: '2026-10-28T10:00:00.000Z',
    nullable: true,
    type: Date,
    description: 'When Premium ends (null on Free). After this date the account returns to Free.',
  })
  currentPeriodEnd: Date | null;

  @ApiProperty({
    example: null,
    nullable: true,
    type: Date,
    description: 'When Premium was last downgraded/cancelled.',
  })
  canceledAt: Date | null;
}

export class SubscriptionChangeDto extends SubscriptionDto {
  @ApiProperty({ example: 'Upgraded to Premium until 2026-10-28' })
  message: string;
}
