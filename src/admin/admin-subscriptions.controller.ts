import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PlanCode, RoleName } from '@prisma/client';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PlanDto, SubscriptionDto } from '../subscriptions/dto/subscription.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AdminService } from './admin.service';
import { AdminSubscriptionsQueryDto, SetPlanDto, UpdatePlanDto } from './dto/admin-query.dto';
import { AdminSubscriptionPageDto } from './dto/admin-response.dto';

@ApiTags('Admin · Subscriptions')
@ApiBearerAuth('access-token')
@Roles(RoleName.ADMIN)
@Controller('admin')
export class AdminSubscriptionsController {
  constructor(
    private readonly admin: AdminService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  @Get('subscriptions')
  @ApiOperation({
    summary: 'List subscriptions (admin)',
    description: 'Filter by `plan` and `status`.',
  })
  @ApiOkResponse({ type: AdminSubscriptionPageDto })
  @ApiErrorResponses(400, 401, 403)
  list(@Query() query: AdminSubscriptionsQueryDto): Promise<AdminSubscriptionPageDto> {
    return this.admin.listSubscriptions(query);
  }

  @Patch('subscriptions/:userId')
  @ApiParam({ name: 'userId', format: 'uuid' })
  @ApiOperation({
    summary: "Set a user's plan (admin)",
    description:
      'E.g. grant Premium for N days, or move a user back to Free. Status becomes ACTIVE.',
  })
  @ApiOkResponse({ type: SubscriptionDto })
  @ApiErrorResponses(400, 401, 403, 404)
  setPlan(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetPlanDto,
  ): Promise<SubscriptionDto> {
    return this.subscriptions.adminSetPlan(userId, dto.plan, dto.periodDays);
  }

  @Patch('plans/:code')
  @ApiParam({ name: 'code', enum: PlanCode })
  @ApiOperation({
    summary: 'Edit a plan: price and limits (admin)',
    description:
      'Changes apply to every subscriber immediately (limits are read from the plan on each request). ' +
      '`null` limit = unlimited. The Free plan cannot be deactivated.',
  })
  @ApiOkResponse({ type: PlanDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  updatePlan(
    @Param('code', new ParseEnumPipe(PlanCode)) code: PlanCode,
    @Body() dto: UpdatePlanDto,
  ): Promise<PlanDto> {
    return this.subscriptions.adminUpdatePlan(code, dto);
  }
}
