import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { AuthResponseDto, MessageResponseDto } from '../auth/dto/auth-response.dto';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UserProfileDto } from './dto/user-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiErrorResponses(401)
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.users.getProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update my profile',
    description: 'Only the fields you send are changed. Email and role cannot be changed here.',
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiErrorResponses(400, 401)
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileDto> {
    return this.users.updateProfile(user.id, dto);
  }

  @Patch('me/password')
  @ApiOperation({
    summary: 'Change my password',
    description:
      'Requires the current password. Signs out **all** devices, then returns a fresh token ' +
      'pair for this one (applied to Authorize automatically in Swagger).',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiErrorResponses(400, 401, 403)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Ip() ipAddress: string,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.users.changePassword(user.id, dto, { ipAddress, userAgent });
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete my account',
    description:
      'Permanently deletes the account and all its data (sessions, subscription, chats, ' +
      'searches). Requires the password. The last admin cannot be deleted.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 401, 403, 409)
  async deleteMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<MessageResponseDto> {
    await this.users.deleteAccount(user.id, dto.password);
    return { message: 'Account deleted' };
  }

  @Patch(':id/role')
  @Roles(RoleName.ADMIN)
  @ApiOperation({
    summary: 'Change a user role (admin only)',
    description: 'Promote to ADMIN or demote to USER. The last admin cannot be demoted.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'User id' })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<UserProfileDto> {
    return this.users.updateRole(id, dto.role);
  }
}
