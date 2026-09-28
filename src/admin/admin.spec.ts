import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthStatus, RoleName } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ProvidersService } from '../providers/providers.service';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';

describe('Admin user management (smoke)', () => {
  const makeUsers = (role: RoleName, activeAdmins = 1) => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true, role: { name: role } }),
        count: jest.fn().mockResolvedValue(activeAdmins),
        update: jest.fn().mockReturnValue('update-op'),
        delete: jest.fn(),
      },
      session: { updateMany: jest.fn().mockReturnValue('revoke-op') },
      $transaction: jest.fn().mockResolvedValue([{ id: 'u2', role: { name: role } }]),
    };
    return {
      prisma,
      users: new UsersService(prisma as unknown as PrismaService, {} as AuthService),
    };
  };

  it('deactivating a user also revokes all their sessions in the same transaction', async () => {
    const { prisma, users } = makeUsers(RoleName.USER);
    await users.setActive('admin-1', 'u2', false);
    expect(prisma.$transaction).toHaveBeenCalledWith(['update-op', 'revoke-op']);
  });

  it('refuses to deactivate yourself or the last active admin, and to delete yourself', async () => {
    const { users } = makeUsers(RoleName.ADMIN, 1);
    await expect(users.setActive('a1', 'a1', false)).rejects.toBeInstanceOf(ConflictException);
    await expect(users.setActive('a1', 'a2', false)).rejects.toThrow('last active admin');
    await expect(users.adminDelete('a1', 'a1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('System health status (smoke)', () => {
  const run = (
    ping: jest.Mock,
    providers: { isEnabled: boolean; healthStatus: HealthStatus }[],
  ) => {
    const prisma = {
      ping,
      aiProvider: { findMany: jest.fn().mockResolvedValue(providers) },
    };
    const config = { get: () => 'test' } as unknown as ConfigService<AppConfig, true>;
    return new AdminService(prisma as unknown as PrismaService, {} as ProvidersService, config)
      .systemHealth(false)
      .then((h) => h.status);
  };

  it('is ok, degraded or down depending on the database and enabled providers', async () => {
    const up = jest.fn().mockResolvedValue(2);
    const healthy = { isEnabled: true, healthStatus: HealthStatus.HEALTHY };
    const unhealthy = { isEnabled: true, healthStatus: HealthStatus.UNHEALTHY };
    const disabledBroken = { isEnabled: false, healthStatus: HealthStatus.UNHEALTHY };

    await expect(run(up, [healthy, disabledBroken])).resolves.toBe('ok');
    await expect(run(up, [healthy, unhealthy])).resolves.toBe('degraded');
    await expect(run(up, [])).resolves.toBe('degraded');
    await expect(run(jest.fn().mockRejectedValue(new Error('db')), [healthy])).resolves.toBe(
      'down',
    );
  });
});
