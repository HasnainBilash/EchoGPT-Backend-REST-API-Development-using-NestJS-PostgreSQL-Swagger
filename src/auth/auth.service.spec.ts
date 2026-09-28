import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { EmailVerificationService } from './email-verification.service';

type Row = Record<string, unknown>;

/** Minimal in-memory stand-in for the Prisma calls AuthService makes. */
function createFakePrisma() {
  const role = { id: 1, name: RoleName.USER };
  const users = new Map<string, Row>();
  const sessions = new Map<string, Row>();
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));

  return {
    sessions,
    role: { findUnique: jest.fn().mockResolvedValue(role) },
    plan: { findUnique: jest.fn().mockResolvedValue({ id: 1, code: 'FREE' }) },
    user: {
      findUnique: jest.fn(({ where }: { where: Row }) => {
        const found = [...users.values()].find((u) => matches(u, where));
        return Promise.resolve(found ? { ...found, role } : null);
      }),
      create: jest.fn(({ data }: { data: Row }) => {
        const user = {
          id: `user-${users.size + 1}`,
          isActive: true,
          emailVerifiedAt: null,
          ...data,
          role,
        };
        users.set(user.id, user);
        return Promise.resolve(user);
      }),
      update: jest.fn(() => Promise.resolve({})),
    },
    session: {
      create: jest.fn(({ data }: { data: Row }) => {
        sessions.set(data.id as string, { revokedAt: null, ...data });
        return Promise.resolve(data);
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(sessions.get(where.id) ?? null),
      ),
      update: jest.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(sessions.get(where.id)!, data);
        return Promise.resolve({});
      }),
      updateMany: jest.fn(({ where, data }: { where: Row; data: Row }) => {
        const hits = [...sessions.values()].filter((s) => matches(s, where));
        hits.forEach((s) => Object.assign(s, data));
        return Promise.resolve({ count: hits.length });
      }),
    },
  };
}

describe('AuthService (smoke)', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createFakePrisma>;
  let verification: { issue: jest.Mock };
  const credentials = { email: 'jane@example.com', password: 'Str0ngPassw0rd' };
  const meta = { ipAddress: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    prisma = createFakePrisma();
    const config = {
      get: () => ({
        accessSecret: 'test-access-secret',
        accessTtl: '15m',
        refreshSecret: 'test-refresh-secret',
        refreshTtl: '30d',
      }),
    } as unknown as ConfigService<AppConfig, true>;
    verification = { issue: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(
      prisma as unknown as PrismaService,
      new JwtService(),
      config,
      verification as unknown as EmailVerificationService,
    );
  });

  it('registers a user on the Free plan and returns a token pair', async () => {
    const res = await service.register(credentials, meta);

    expect(res.accessToken).toBeDefined();
    expect(res.refreshToken).toBeDefined();
    expect(res.user).toMatchObject({ email: credentials.email, role: RoleName.USER });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ subscription: { create: { planId: 1 } } }) as unknown,
      }),
    );
    // Password is hashed, never stored as-is.
    const stored = (prisma.user.create.mock.calls[0] as [{ data: Row }])[0].data;
    expect(stored.passwordHash).not.toBe(credentials.password);
  });

  it('sends a verification email on sign-up, and a mail failure does not block sign-up', async () => {
    const res = await service.register(credentials, meta);
    expect(verification.issue).toHaveBeenCalledWith(res.user.id, credentials.email);
    expect(res.user.emailVerified).toBe(false);

    verification.issue.mockRejectedValueOnce(new Error('SMTP down'));
    await expect(
      service.register({ ...credentials, email: 'other@example.com' }, meta),
    ).resolves.toHaveProperty('accessToken');
  });

  it('rejects a duplicate email with 409', async () => {
    await service.register(credentials, meta);
    await expect(service.register(credentials, meta)).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in with the right password and rejects the wrong one', async () => {
    await service.register(credentials, meta);

    await expect(service.login(credentials, meta)).resolves.toHaveProperty('accessToken');
    await expect(
      service.login({ ...credentials, password: 'WrongPassw0rd' }, meta),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates refresh tokens and revokes the session when an old one is replayed', async () => {
    const { refreshToken: first } = await service.register(credentials, meta);

    const { refreshToken: second } = await service.refresh(first);
    expect(second).not.toBe(first);

    await expect(service.refresh(first)).rejects.toBeInstanceOf(UnauthorizedException);
    // Reuse detection killed the session, so even the newest token is dead now.
    await expect(service.refresh(second)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logout revokes the session so its refresh token stops working', async () => {
    const { refreshToken, user } = await service.register(credentials, meta);

    await service.logout(user.id, refreshToken);

    await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
