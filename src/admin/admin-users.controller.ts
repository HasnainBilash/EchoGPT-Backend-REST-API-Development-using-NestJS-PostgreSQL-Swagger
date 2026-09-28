import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { MessageResponseDto } from '../auth/dto/auth-response.dto';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { UpdateRoleDto } from '../users/dto/update-role.dto';
import { UserProfileDto } from '../users/dto/user-profile.dto';
import { UsersService } from '../users/users.service';
import { AdminService } from './admin.service';
import { AdminUsersQueryDto, SetUserStatusDto } from './dto/admin-query.dto';
import { AdminUserDetailDto, AdminUserPageDto } from './dto/admin-response.dto';

const UserId = () => ApiParam({ name: 'id', format: 'uuid', description: 'User id' });

@ApiTags('Admin · Users')
@ApiBearerAuth('access-token')
@Roles(RoleName.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List users (admin)',
    description: 'Newest first. Filter by `search` (email/name), `role` and `isActive`.',
  })
  @ApiOkResponse({ type: AdminUserPageDto })
  @ApiErrorResponses(400, 401, 403)
  list(@Query() query: AdminUsersQueryDto): Promise<AdminUserPageDto> {
    return this.admin.listUsers(query);
  }

  @Get(':id')
  @UserId()
  @ApiOperation({ summary: 'Get a user with plan and activity stats (admin)' })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiErrorResponses(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminUserDetailDto> {
    return this.admin.getUser(id);
  }

  @Patch(':id/role')
  @UserId()
  @ApiOperation({
    summary: 'Change a user role (admin)',
    description: 'Promote to ADMIN or demote to USER. The last admin cannot be demoted.',
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<UserProfileDto> {
    return this.users.updateRole(id, dto.role);
  }

  @Patch(':id/status')
  @UserId()
  @ApiOperation({
    summary: 'Activate or deactivate a user (admin)',
    description:
      'A deactivated user is signed out everywhere and cannot log in until reactivated. ' +
      'You cannot deactivate yourself or the last active admin.',
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserStatusDto,
  ): Promise<UserProfileDto> {
    return this.users.setActive(actor.id, id, dto.isActive);
  }

  @Delete(':id')
  @UserId()
  @ApiOperation({
    summary: 'Delete a user (admin)',
    description:
      'Permanently deletes the account and its data. Not for your own account or the last admin.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  async remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageResponseDto> {
    await this.users.adminDelete(actor.id, id);
    return { message: 'User deleted' };
  }
}
