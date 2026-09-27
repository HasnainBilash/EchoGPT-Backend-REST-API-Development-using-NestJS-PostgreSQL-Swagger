import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { SubscriptionChangeDto, SubscriptionDto } from './dto/subscription.dto';
import { UsageDto } from './dto/usage.dto';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';

@ApiTags('Subscriptions')
@ApiBearerAuth('access-token')
@Controller('subscriptions/me')
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly usage: UsageService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get my subscription status',
    description:
      'Current plan and status. `ACTIVE` = plan in force; `CANCELED` = downgraded to Free; ' +
      '`EXPIRED` = Premium period ended and the account returned to Free.',
  })
  @ApiOkResponse({ type: SubscriptionDto })
  @ApiErrorResponses(401)
  getMine(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionDto> {
    return this.subscriptions.getMine(user.id);
  }

  @Get('usage')
  @ApiOperation({
    summary: 'Get my usage and remaining requests',
    description:
      'Chat and search requests used today (UTC) versus the plan limit. Counters reset at ' +
      '`resetsAt`. `null` limit/remaining means unlimited.',
  })
  @ApiOkResponse({ type: UsageDto })
  @ApiErrorResponses(401)
  getUsage(@CurrentUser() user: AuthenticatedUser): Promise<UsageDto> {
    return this.usage.getUsage(user.id);
  }

  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Upgrade to Premium',
    description: `Starts a 30-day Premium period with higher limits. No payment is taken (out of scope for this API); in production this would be triggered by a payment provider webhook.`,
  })
  @ApiOkResponse({ type: SubscriptionChangeDto })
  @ApiErrorResponses(401, 409)
  upgrade(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionChangeDto> {
    return this.subscriptions.upgrade(user.id);
  }

  @Post('downgrade')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Downgrade to Free',
    description: 'Switches back to the Free plan immediately; Free limits apply from now on.',
  })
  @ApiOkResponse({ type: SubscriptionChangeDto })
  @ApiErrorResponses(401, 409)
  downgrade(@CurrentUser() user: AuthenticatedUser): Promise<SubscriptionChangeDto> {
    return this.subscriptions.downgrade(user.id);
  }
}
