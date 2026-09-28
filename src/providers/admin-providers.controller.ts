import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { MessageResponseDto } from '../auth/dto/auth-response.dto';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateProviderDto } from './dto/create-provider.dto';
import { ProviderDto } from './dto/provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProvidersService } from './providers.service';

const ProviderId = () => ApiParam({ name: 'id', format: 'uuid', description: 'Provider id' });

@ApiTags('Admin · AI Providers')
@ApiBearerAuth('access-token')
@Roles(RoleName.ADMIN)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  @ApiOperation({
    summary: 'List all providers (admin)',
    description: 'Includes disabled ones. API keys are masked.',
  })
  @ApiOkResponse({ type: ProviderDto, isArray: true })
  @ApiErrorResponses(401, 403)
  list(): Promise<ProviderDto[]> {
    return this.providers.list();
  }

  @Post()
  @ApiOperation({
    summary: 'Add a provider (admin)',
    description:
      'The API key is encrypted (AES-256-GCM) before it is stored and is never returned. ' +
      'The first enabled provider becomes the default automatically.',
  })
  @ApiCreatedResponse({ type: ProviderDto })
  @ApiErrorResponses(400, 401, 403, 409)
  create(@Body() dto: CreateProviderDto): Promise<ProviderDto> {
    return this.providers.create(dto);
  }

  @Get(':id')
  @ProviderId()
  @ApiOperation({ summary: 'Get one provider (admin)' })
  @ApiOkResponse({ type: ProviderDto })
  @ApiErrorResponses(400, 401, 403, 404)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderDto> {
    return this.providers.get(id);
  }

  @Patch(':id')
  @ProviderId()
  @ApiOperation({
    summary: 'Edit a provider (admin)',
    description: 'Only the fields sent are changed. Send `apiKey` only to rotate the key.',
  })
  @ApiOkResponse({ type: ProviderDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderDto> {
    return this.providers.update(id, dto);
  }

  @Delete(':id')
  @ProviderId()
  @ApiOperation({
    summary: 'Delete a provider (admin)',
    description:
      'Past chats keep their messages. If it was the default, another enabled provider takes over.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 401, 403, 404)
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<MessageResponseDto> {
    await this.providers.remove(id);
    return { message: 'Provider deleted' };
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @ProviderId()
  @ApiOperation({ summary: 'Enable a provider (admin)' })
  @ApiOkResponse({ type: ProviderDto })
  @ApiErrorResponses(400, 401, 403, 404)
  enable(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderDto> {
    return this.providers.setEnabled(id, true);
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @ProviderId()
  @ApiOperation({
    summary: 'Disable a provider (admin)',
    description:
      'Users can no longer pick it. If it was the default, another enabled provider takes over.',
  })
  @ApiOkResponse({ type: ProviderDto })
  @ApiErrorResponses(400, 401, 403, 404)
  disable(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderDto> {
    return this.providers.setEnabled(id, false);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  @ProviderId()
  @ApiOperation({
    summary: 'Make this the default provider (admin)',
    description: 'Must be enabled.',
  })
  @ApiOkResponse({ type: ProviderDto })
  @ApiErrorResponses(400, 401, 403, 404, 409)
  setDefault(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderDto> {
    return this.providers.setDefault(id);
  }

  @Post(':id/health-check')
  @HttpCode(HttpStatus.OK)
  @ProviderId()
  @ApiOperation({
    summary: 'Run a health check (admin)',
    description:
      'Makes a real authenticated call to the vendor (list models) and stores the result. ' +
      'An invalid key or unreachable vendor returns 200 with `health.status = UNHEALTHY` and the reason.',
  })
  @ApiOkResponse({ type: ProviderDto })
  @ApiErrorResponses(400, 401, 403, 404)
  checkHealth(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderDto> {
    return this.providers.checkHealth(id);
  }
}
