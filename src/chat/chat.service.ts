import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiProvider, Message, MessageRole, Prisma, UsageType } from '@prisma/client';
import { PaginationQueryDto, pageMeta } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ChatTurn } from '../providers/adapters/ai-provider.adapter';
import { ProviderAdapterRegistry } from '../providers/adapters/provider-adapter.registry';
import { ProviderRequestError } from '../providers/adapters/provider-http';
import { ProvidersService } from '../providers/providers.service';
import { UsageService } from '../subscriptions/usage.service';
import {
  ConversationDetailDto,
  ConversationPageDto,
  ConversationSummaryDto,
  MessageDto,
  SendMessageResponseDto,
} from './dto/chat-response.dto';
import { SendMessageDto } from './dto/send-message.dto';

/** How many earlier messages are sent to the AI as context. */
export const HISTORY_WINDOW = 20;
const SYSTEM_PROMPT = 'You are EchoGPT, a helpful and concise AI assistant.';

const SUMMARY_INCLUDE = {
  provider: { select: { id: true, name: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof SUMMARY_INCLUDE }>;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProvidersService,
    private readonly adapters: ProviderAdapterRegistry,
    private readonly usage: UsageService,
  ) {}

  async sendMessage(userId: string, dto: SendMessageDto): Promise<SendMessageResponseDto> {
    await this.usage.assertWithinLimit(userId, UsageType.CHAT);

    const conversation = dto.conversationId
      ? await this.findOwnConversation(userId, dto.conversationId)
      : null;
    const provider = await this.providers.resolveForChat(dto.providerId, conversation?.providerId);
    const model = this.pickModel(provider, dto.model, conversation);

    const history = conversation
      ? await this.prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_WINDOW,
        })
      : [];
    const turns: ChatTurn[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.reverse().map((m) => ({ role: toTurnRole(m.role), content: m.content })),
      { role: 'user', content: dto.message },
    ];

    const sentAt = new Date();
    let result;
    try {
      result = await this.adapters.get(provider.type).chat(this.providers.connectionOf(provider), {
        model,
        messages: turns,
        maxOutputTokens: provider.maxOutputTokens,
      });
    } catch (err) {
      if (err instanceof ProviderRequestError) {
        // Nothing is saved and no quota is used for a failed call.
        this.logger.warn(`Chat via "${provider.name}" failed: ${err.message}`);
        throw new BadGatewayException(`AI provider "${provider.name}" failed: ${err.summary}`);
      }
      throw err;
    }
    const repliedAt = new Date();

    const saved = await this.prisma.$transaction(async (tx) => {
      const conv = conversation
        ? await tx.conversation.update({
            where: { id: conversation.id },
            data: { providerId: provider.id, model },
          })
        : await tx.conversation.create({
            data: { userId, title: makeTitle(dto.message), providerId: provider.id, model },
          });

      // Explicit timestamps: inside one transaction now() is identical, which would make order ambiguous.
      const userMessage = await tx.message.create({
        data: {
          conversationId: conv.id,
          role: MessageRole.USER,
          content: dto.message,
          createdAt: sentAt,
        },
      });
      const reply = await tx.message.create({
        data: {
          conversationId: conv.id,
          role: MessageRole.ASSISTANT,
          content: result.content,
          providerId: provider.id,
          model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          latencyMs: repliedAt.getTime() - sentAt.getTime(),
          createdAt: repliedAt,
        },
      });
      await tx.usageRecord.create({
        data: {
          userId,
          type: UsageType.CHAT,
          providerId: provider.id,
          model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        },
      });

      const full = await tx.conversation.findUniqueOrThrow({
        where: { id: conv.id },
        include: SUMMARY_INCLUDE,
      });
      return { conversation: full, userMessage, reply };
    });

    const usage = await this.usage.getUsage(userId);
    return {
      conversation: toSummary(saved.conversation),
      userMessage: toMessage(saved.userMessage),
      reply: toMessage(saved.reply),
      usage: usage.chat,
    };
  }

  async listConversations(userId: string, query: PaginationQueryDto): Promise<ConversationPageDto> {
    const where = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.conversation.findMany({
        where,
        include: SUMMARY_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return { items: rows.map(toSummary), meta: pageMeta(query, total) };
  }

  async getConversation(userId: string, id: string): Promise<ConversationDetailDto> {
    await this.findOwnConversation(userId, id);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: { ...SUMMARY_INCLUDE, messages: { orderBy: { createdAt: 'asc' } } },
    });
    return { ...toSummary(conversation), messages: conversation.messages.map(toMessage) };
  }

  async renameConversation(
    userId: string,
    id: string,
    title: string,
  ): Promise<ConversationSummaryDto> {
    await this.findOwnConversation(userId, id);
    const updated = await this.prisma.conversation.update({
      where: { id },
      data: { title },
      include: SUMMARY_INCLUDE,
    });
    return toSummary(updated);
  }

  async deleteConversation(userId: string, id: string): Promise<void> {
    await this.findOwnConversation(userId, id);
    await this.prisma.conversation.delete({ where: { id } });
  }

  /** 404 (not 403) for other users' conversations, so ids can't be probed. */
  private async findOwnConversation(userId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({ where: { id, userId } });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  private pickModel(
    provider: AiProvider,
    requested: string | undefined,
    conversation: { providerId: string | null; model: string | null } | null,
  ): string {
    if (requested) {
      if (!provider.models.includes(requested)) {
        throw new BadRequestException(
          `Model "${requested}" is not available for ${provider.name}. Choose one of: ${provider.models.join(', ')}`,
        );
      }
      return requested;
    }
    if (
      conversation?.providerId === provider.id &&
      conversation.model &&
      provider.models.includes(conversation.model)
    ) {
      return conversation.model;
    }
    return provider.defaultModel;
  }
}

function toTurnRole(role: MessageRole): ChatTurn['role'] {
  return role === MessageRole.ASSISTANT
    ? 'assistant'
    : role === MessageRole.SYSTEM
      ? 'system'
      : 'user';
}

function makeTitle(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
}

function toSummary(c: ConversationRow): ConversationSummaryDto {
  return {
    id: c.id,
    title: c.title,
    provider: c.provider,
    model: c.model,
    messageCount: c._count.messages,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toMessage(m: Message): MessageDto {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    model: m.model,
    promptTokens: m.promptTokens,
    completionTokens: m.completionTokens,
    latencyMs: m.latencyMs,
    createdAt: m.createdAt,
  };
}
