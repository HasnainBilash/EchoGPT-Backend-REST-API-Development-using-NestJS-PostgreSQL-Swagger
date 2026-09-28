import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UsersModule } from '../users/users.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [UsersModule, SubscriptionsModule, ProvidersModule],
  controllers: [AdminController, AdminUsersController, AdminSubscriptionsController],
  providers: [AdminService],
})
export class AdminModule {}
