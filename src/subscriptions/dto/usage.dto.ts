import { ApiProperty } from '@nestjs/swagger';
import { PlanCode } from '@prisma/client';

export class UsageCounterDto {
  @ApiProperty({ example: 20, nullable: true, type: Number, description: 'null = unlimited' })
  limit: number | null;

  @ApiProperty({ example: 3 })
  used: number;

  @ApiProperty({ example: 17, nullable: true, type: Number, description: 'null = unlimited' })
  remaining: number | null;
}

export class UsageDto {
  @ApiProperty({ enum: PlanCode, example: PlanCode.FREE })
  plan: PlanCode;

  @ApiProperty({
    example: '2026-09-28T00:00:00.000Z',
    description: 'Start of the current UTC day.',
  })
  periodStart: Date;

  @ApiProperty({ example: '2026-09-29T00:00:00.000Z', description: 'When the counters reset.' })
  resetsAt: Date;

  @ApiProperty({ type: UsageCounterDto })
  chat: UsageCounterDto;

  @ApiProperty({ type: UsageCounterDto })
  search: UsageCounterDto;
}
