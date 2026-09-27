import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';

export class AuthUserDto {
  @ApiProperty({ example: '3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f' })
  id: string;

  @ApiProperty({ example: 'jane@example.com' })
  email: string;

  @ApiPropertyOptional({ example: 'Jane Doe', nullable: true })
  fullName: string | null;

  @ApiProperty({ enum: RoleName, example: RoleName.USER })
  role: RoleName;
}

export class AuthTokensDto {
  @ApiProperty({ description: 'Short-lived JWT. Send as `Authorization: Bearer <token>`.' })
  accessToken: string;

  @ApiProperty({ description: 'Long-lived JWT used only with /auth/refresh and /auth/logout.' })
  refreshToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: '15m', description: 'Access token lifetime.' })
  expiresIn: string;
}

export class AuthResponseDto extends AuthTokensDto {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'Logged out successfully' })
  message: string;
}
