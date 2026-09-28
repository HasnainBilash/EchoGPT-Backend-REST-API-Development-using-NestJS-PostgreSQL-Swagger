import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
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
  private readonly logger = new Logger(ChatController.name);

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

  @Post('messages/stream')
  @ApiOperation({
    summary: 'Send a prompt and stream the AI reply (Premium)',
    description:
      'Same input and rules as `POST /chat/messages`, but the reply arrives as it is generated, as ' +
      '**Server-Sent Events** (`text/event-stream`):\n\n' +
      '- `start` — `{ conversationId, provider, model }` (`conversationId` is null for a new chat)\n' +
      '- `delta` — `{ text }`, repeated; concatenate them for the full reply\n' +
      '- `done` — the same body as `POST /chat/messages` (saved conversation, messages, usage)\n' +
      '- `error` — `{ statusCode, message }`; nothing was saved\n\n' +
      'Available on plans with streaming enabled (Premium); Free gets 403. Errors found before ' +
      'streaming starts (403, 404, 429, …) are normal JSON responses. If the client disconnects, the ' +
      'AI call is cancelled and nothing is saved or counted. Browsers: read it with `fetch()` and a ' +
      'stream reader (EventSource only supports GET).',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'An event stream.',
    content: {
      'text/event-stream': {
        example:
          'event: start\ndata: {"conversationId":null,"provider":{"id":"…","name":"OpenAI"},"model":"gpt-4o-mini"}\n\n' +
          'event: delta\ndata: {"text":"A REST API"}\n\n' +
          'event: delta\ndata: {"text":" is …"}\n\n' +
          'event: done\ndata: {"conversation":{…},"userMessage":{…},"reply":{…},"usage":{…}}\n\n',
      },
    },
  })
  @ApiErrorResponses(400, 401, 403, 404, 429, 503)
  async stream(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
    @Res() res: Response,
  ): Promise<void> {
    // Throws before any byte is written, so these become regular JSON errors.
    const chat = await this.chat.prepareStream(user.id, dto);

    res.status(HttpStatus.OK).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
    });
    res.flushHeaders();

    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort(); // client went away mid-stream
    });
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    send('start', {
      conversationId: chat.conversation?.id ?? null,
      provider: { id: chat.provider.id, name: chat.provider.name },
      model: chat.model,
    });
    try {
      const result = await this.chat.streamReply(chat, abort.signal, (text) =>
        send('delta', { text }),
      );
      send('done', result);
    } catch (err) {
      if (!abort.signal.aborted) {
        const isHttp = err instanceof HttpException;
        if (!isHttp) this.logger.error(err);
        send('error', {
          statusCode: isHttp ? err.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
          message: isHttp ? err.message : 'Unexpected error while streaming',
        });
      }
    } finally {
      res.end();
    }
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
