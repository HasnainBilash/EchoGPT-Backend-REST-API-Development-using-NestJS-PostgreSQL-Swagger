import { Module } from '@nestjs/common';
import { PlansController } from './plans.controller';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { UsageService } from './usage.service';

@Module({
  controllers: [PlansController, SubscriptionsController],
  providers: [SubscriptionsService, UsageService],
  exports: [SubscriptionsService, UsageService],
})
export class SubscriptionsModule {}
