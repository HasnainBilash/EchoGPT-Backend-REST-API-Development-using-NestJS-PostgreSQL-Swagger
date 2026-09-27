import { SetMetadata } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. Requires an authenticated request (not @Public()). */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
