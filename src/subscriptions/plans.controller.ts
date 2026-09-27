import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PlanDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions')
@Controller('plans')
export class PlansController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List available plans',
    description: 'Public — lets the extension show a pricing screen before login.',
  })
  @ApiOkResponse({ type: PlanDto, isArray: true })
  list(): Promise<PlanDto[]> {
    return this.subscriptions.listPlans();
  }
}
