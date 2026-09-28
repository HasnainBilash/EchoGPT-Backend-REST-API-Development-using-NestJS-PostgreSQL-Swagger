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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { MessageResponseDto } from '../auth/dto/auth-response.dto';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { ChatService } from './chat.service';
import {
  ConversationDetailDto,
  ConversationPageDto,
  ConversationSummaryDto,
  SendMessageResponseDto,
} from './dto/chat-response.dto';
import { RenameConversationDto } from './dto/rename-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

const ConversationId = () =>
  ApiParam({ name: 'id', format: 'uuid', description: 'Conversation id' });

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post('messages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a prompt and get the AI reply',
    description:
      'Starts a new conversation (omit `conversationId`) or continues one. The last ' +
      '20 messages are sent as context. Counts toward the daily chat limit (429 when used up). ' +
      'If the AI provider fails, 502 is returned and nothing is saved or counted.',
  })
  @ApiOkResponse({ type: SendMessageResponseDto })
  @ApiErrorResponses(400, 401, 404, 429, 502, 503)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResponseDto> {
    return this.chat.sendMessage(user.id, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List my conversations', description: 'Most recently active first.' })
  @ApiOkResponse({ type: ConversationPageDto })
  @ApiErrorResponses(400, 401)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<ConversationPageDto> {
    return this.chat.listConversations(user.id, query);
  }

  @Get('conversations/:id')
  @ConversationId()
  @ApiOperation({ summary: 'Get a conversation with its messages' })
  @ApiOkResponse({ type: ConversationDetailDto })
  @ApiErrorResponses(400, 401, 404)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ConversationDetailDto> {
    return this.chat.getConversation(user.id, id);
  }

  @Patch('conversations/:id')
  @ConversationId()
  @ApiOperation({ summary: 'Rename a conversation' })
  @ApiOkResponse({ type: ConversationSummaryDto })
  @ApiErrorResponses(400, 401, 404)
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameConversationDto,
  ): Promise<ConversationSummaryDto> {
    return this.chat.renameConversation(user.id, id, dto.title);
  }

  @Delete('conversations/:id')
  @ConversationId()
  @ApiOperation({ summary: 'Delete a conversation and its messages' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiErrorResponses(400, 401, 404)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MessageResponseDto> {
    await this.chat.deleteConversation(user.id, id);
    return { message: 'Conversation deleted' };
  }
}
