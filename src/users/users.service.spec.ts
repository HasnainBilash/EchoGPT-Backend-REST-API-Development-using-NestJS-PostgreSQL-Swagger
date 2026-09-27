import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService (smoke)', () => {
  const password = 'Str0ngPassw0rd';
  let passwordHash: string;
  let prisma: {
    user: Record<string, jest.Mock>;
    session: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };
  let auth: { startSession: jest.Mock };
  let service: UsersService;

  const withRole = (role: RoleName) => ({ passwordHash, role: { name: role } });

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(withRole(RoleName.USER)),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      session: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    auth = { startSession: jest.fn().mockResolvedValue({ accessToken: 'new' }) };
    service = new UsersService(prisma as unknown as PrismaService, auth as unknown as AuthService);
  });

  it('changes the password, revokes all sessions and starts a new one', async () => {
    const res = await service.changePassword(
      'u1',
      { currentPassword: password, newPassword: 'N3wPassw0rd' },
      {},
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', revokedAt: null } }),
    );
    expect(auth.startSession).toHaveBeenCalledWith('u1', {});
    expect(res).toEqual({ accessToken: 'new' });
  });

  it('rejects a wrong current password (403) and reusing the same password (400)', async () => {
    await expect(
      service.changePassword(
        'u1',
        { currentPassword: 'Wr0ngPass', newPassword: 'N3wPassw0rd' },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.changePassword('u1', { currentPassword: password, newPassword: password }, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes the account only with the right password', async () => {
    await expect(service.deleteAccount('u1', 'Wr0ngPass')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();

    await service.deleteAccount('u1', password);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });

  it('never removes the last admin (delete or demote)', async () => {
    prisma.user.findUnique.mockResolvedValue(withRole(RoleName.ADMIN));

    await expect(service.deleteAccount('a1', password)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateRole('a1', RoleName.USER)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
