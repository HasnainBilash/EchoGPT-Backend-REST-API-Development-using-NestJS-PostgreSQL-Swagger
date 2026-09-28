import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuthService, BCRYPT_ROUNDS, ClientMeta } from '../auth/auth.service';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileDto } from './dto/user-profile.dto';

const PROFILE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  avatarUrl: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PROFILE_SELECT,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toProfile(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfileDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName, avatarUrl: dto.avatarUrl },
      select: PROFILE_SELECT,
    });
    return this.toProfile(user);
  }

  /** Changes the password, signs out every device, and returns fresh tokens for this one. */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    meta: ClientMeta,
  ): Promise<AuthResponseDto> {
    const user = await this.findWithPassword(userId);
    await this.assertPassword(
      dto.currentPassword,
      user.passwordHash,
      'Current password is incorrect',
    );

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('New password must be different from the current one');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return this.auth.startSession(userId, meta);
  }

  /** Permanently deletes the account and everything it owns (sessions, chats, searches...). */
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.findWithPassword(userId);
    await this.assertPassword(password, user.passwordHash, 'Password is incorrect');

    if (user.role.name === RoleName.ADMIN) {
      await this.assertNotLastAdmin('The last admin account cannot be deleted');
    }

    // Cascades remove sessions, subscription, chats, searches and usage; request logs are kept anonymized.
    await this.prisma.user.delete({ where: { id: userId } });
  }

  /** Admin only: promote a user to ADMIN or demote to USER. Takes effect on the next request. */
  async updateRole(targetUserId: string, role: RoleName): Promise<UserProfileDto> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: { select: { name: true } } },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }

    if (target.role.name === RoleName.ADMIN && role !== RoleName.ADMIN) {
      await this.assertNotLastAdmin('Cannot demote the last admin');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: { connect: { name: role } } },
      select: PROFILE_SELECT,
    });
    return this.toProfile(updated);
  }

  /** Admin: activate or deactivate an account. Deactivating signs the user out everywhere. */
  async setActive(
    actorId: string,
    targetUserId: string,
    isActive: boolean,
  ): Promise<UserProfileDto> {
    if (actorId === targetUserId && !isActive) {
      throw new ConflictException('You cannot deactivate your own account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { isActive: true, role: { select: { name: true } } },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (!isActive && target.isActive && target.role.name === RoleName.ADMIN) {
      const activeAdmins = await this.prisma.user.count({
        where: { isActive: true, role: { name: RoleName.ADMIN } },
      });
      if (activeAdmins <= 1) {
        throw new ConflictException('Cannot deactivate the last active admin');
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { isActive },
        select: PROFILE_SELECT,
      }),
      ...(isActive
        ? []
        : [
            this.prisma.session.updateMany({
              where: { userId: targetUserId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]),
    ]);
    return this.toProfile(updated);
  }

  /** Admin: permanently delete another user's account. */
  async adminDelete(actorId: string, targetUserId: string): Promise<void> {
    if (actorId === targetUserId) {
      throw new ConflictException('Use DELETE /users/me to delete your own account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { role: { select: { name: true } } },
    });
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role.name === RoleName.ADMIN) {
      await this.assertNotLastAdmin('The last admin account cannot be deleted');
    }
    await this.prisma.user.delete({ where: { id: targetUserId } });
  }

  private async findWithPassword(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, role: { select: { name: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async assertPassword(plain: string, hash: string, message: string): Promise<void> {
    if (!(await bcrypt.compare(plain, hash))) {
      throw new ForbiddenException(message);
    }
  }

  private async assertNotLastAdmin(message: string): Promise<void> {
    const admins = await this.prisma.user.count({ where: { role: { name: RoleName.ADMIN } } });
    if (admins <= 1) {
      throw new ConflictException(message);
    }
  }

  private toProfile(user: ProfileRow): UserProfileDto {
    const { role, ...rest } = user;
    return { ...rest, role: role.name };
  }
}
