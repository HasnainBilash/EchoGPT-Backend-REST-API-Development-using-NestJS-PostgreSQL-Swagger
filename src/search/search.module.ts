import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { DuckDuckGoClient } from './duckduckgo.client';
import { SearchCacheService } from './search-cache.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [ProvidersModule, SubscriptionsModule],
  controllers: [SearchController],
  providers: [SearchService, DuckDuckGoClient, SearchCacheService],
})
export class SearchModule {}
