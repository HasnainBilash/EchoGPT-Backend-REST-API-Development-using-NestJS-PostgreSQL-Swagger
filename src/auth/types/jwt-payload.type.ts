import { RoleName } from '@prisma/client';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: RoleName;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
}
