import { ApiProperty } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class UserProfileDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' })
  id: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiProperty({ example: 'Jane Doe', nullable: true, type: String })
  fullName: string | null;

  @ApiProperty({ example: 'https://example.com/avatar.png', nullable: true, type: String })
  avatarUrl: string | null;

  @ApiProperty({ enum: RoleName, example: RoleName.USER })
  role: RoleName;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({
    example: '2026-09-28T10:00:00.000Z',
    nullable: true,
    type: Date,
    description: 'When the email address was verified; null = not verified yet.',
  })
  emailVerifiedAt: Date | null;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z', nullable: true, type: Date })
  lastLoginAt: Date | null;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-09-28T10:00:00.000Z' })
  updatedAt: Date;
}
