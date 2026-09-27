import { RoleName } from '@prisma/client';

/** Shape attached to `request.user` by JwtStrategy after a valid access token. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleName;
}
