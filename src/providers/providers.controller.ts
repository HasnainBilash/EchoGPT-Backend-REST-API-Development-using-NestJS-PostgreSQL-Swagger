import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { PublicProviderDto } from './dto/provider.dto';
import { ProvidersService } from './providers.service';

@ApiTags('AI Providers')
@ApiBearerAuth('access-token')
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  @ApiOperation({
    summary: 'List providers I can chat with',
    description: 'Enabled providers and their models, default first. No secrets.',
  })
  @ApiOkResponse({ type: PublicProviderDto, isArray: true })
  @ApiErrorResponses(401)
  list(): Promise<PublicProviderDto[]> {
    return this.providers.listPublic();
  }
}
