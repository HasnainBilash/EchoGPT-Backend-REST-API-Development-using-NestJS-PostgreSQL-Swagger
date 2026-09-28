import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { MessageResponseDto } from '../auth/dto/auth-response.dto';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import {
  RecentQueryDto,
  RecentSearchDto,
  SearchDetailDto,
  SearchPageDto,
  SearchQueryDto,
  SearchResponseDto,
  SuggestionDto,
  SuggestionsQueryDto,
} from './dto/search.dto';
import { SearchService } from './search.service';

const SearchId = () => ApiParam({ name: 'id', format: 'uuid', description: 'Search id' });

@ApiTags('Web Search')
@ApiBearerAuth('access-token')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search the web (AI-assisted)',
    description:
      'Searches DuckDuckGo and, unless `summarize` is false, asks an AI provider to summarize ' +
      'the results with citations. If the summary fails the results are still returned, with ' +
      '`summaryError` explaining why. Saved to history and counted toward the daily search limit (429). ' +
      'DuckDuckGo Instant Answer works best for topics ("NestJS", "Bangladesh"); questions often return no results.',
  })
  @ApiOkResponse({ type: SearchResponseDto })
  @ApiErrorResponses(400, 401, 404, 429, 502)
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SearchQueryDto,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(user.id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'My search history', description: 'Newest first, paginated.' })
  @ApiOkResponse({ type: SearchPageDto })
  @ApiErrorResponses(400, 401)
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<SearchPageDto> {
    return this.searchService.history(user.id, query);
  }

  @Get('history/:id')
  @SearchId()
  @ApiOperation({
    summary: 'Get one past search',
    description: 'Returns the saved results and summary exactly as they were.',
  })
  @ApiOkResponse({ type: SearchDetailDto })
  @ApiErrorResponses(400, 401, 404)
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SearchDetailDto> {
    return this.searchService.getOne(user.id, id);
  }

  @Delete('history/:id')
  @SearchId()
  @ApiOperation({ summary: 'Delete one search from history' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 401, 404)
  async deleteOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageResponseDto> {
    await this.searchService.deleteOne(user.id, id);
    return { message: 'Search deleted' };
  }

  @Delete('history')
  @ApiOperation({ summary: 'Clear my whole search history' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(401)
  async clear(@CurrentUser() user: AuthenticatedUser): Promise<MessageResponseDto> {
    const count = await this.searchService.clearHistory(user.id);
    return { message: `Deleted ${count} search(es)` };
  }

  @Get('recent')
  @ApiOperation({
    summary: 'My recent searches',
    description: 'Latest distinct queries — repeated searches appear once.',
  })
  @ApiOkResponse({ type: RecentSearchDto, isArray: true })
  @ApiErrorResponses(400, 401)
  recent(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RecentQueryDto,
  ): Promise<RecentSearchDto[]> {
    return this.searchService.recent(user.id, query.limit);
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Search suggestions while typing',
    description:
      'Up to 8 suggestions: your own matching past searches first (`history`), then DuckDuckGo ' +
      'autocomplete (`web`). Does not count toward any limit.',
  })
  @ApiOkResponse({ type: SuggestionDto, isArray: true })
  @ApiErrorResponses(400, 401)
  suggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SuggestionsQueryDto,
  ): Promise<SuggestionDto[]> {
    return this.searchService.suggestions(user.id, query.q);
  }
}
