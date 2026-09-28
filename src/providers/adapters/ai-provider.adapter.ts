import { AiProviderType } from '@prisma/client';

export interface ProviderConnection {
  apiKey: string;
  /** Overrides the vendor's default API URL (e.g. an OpenAI-compatible gateway). */
  baseUrl?: string | null;
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  /** Oldest first; the last one is the new user prompt. */
  messages: ChatTurn[];
  maxOutputTokens: number;
}

export interface ChatResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
}

/** A piece of a streamed reply: more text, or token counts (usually at the end). */
export type ChatStreamEvent =
  | { type: 'text'; text: string }
  | { type: 'usage'; promptTokens?: number; completionTokens?: number };

/** One implementation per AI vendor. Callers only depend on this interface. */
export interface AiProviderAdapter {
  readonly type: AiProviderType;

  /** Makes a cheap authenticated call (list models). Throws ProviderRequestError on failure. */
  checkHealth(connection: ProviderConnection): Promise<void>;

  /** Sends the conversation and returns the model's reply. Throws ProviderRequestError on failure. */
  chat(connection: ProviderConnection, request: ChatRequest): Promise<ChatResult>;

  /** Same as `chat`, but yields the reply as it is generated. Aborting `signal` stops it. */
  chatStream(
    connection: ProviderConnection,
    request: ChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent>;
}
