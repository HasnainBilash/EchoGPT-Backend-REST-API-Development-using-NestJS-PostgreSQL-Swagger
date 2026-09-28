import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import {
  AiProviderAdapter,
  ChatRequest,
  ChatResult,
  ChatStreamEvent,
  ProviderConnection,
} from './ai-provider.adapter';
import {
  CHAT_TIMEOUT_MS,
  ProviderRequestError,
  readSseData,
  requestJson,
  requestStream,
  trimSlash,
} from './provider-http';

interface GeminiGenerateResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

@Injectable()
export class GeminiAdapter implements AiProviderAdapter {
  readonly type = AiProviderType.GEMINI;

  async checkHealth({ apiKey, baseUrl }: ProviderConnection): Promise<void> {
    // Key goes in a header, not the query string, so it never lands in URL logs.
    await requestJson(`${this.base(baseUrl)}/models?pageSize=1`, {
      headers: { 'x-goog-api-key': apiKey },
    });
  }

  async chat({ apiKey, baseUrl }: ProviderConnection, req: ChatRequest): Promise<ChatResult> {
    const res = await requestJson<GeminiGenerateResponse>(
      `${this.base(baseUrl)}/models/${encodeURIComponent(req.model)}:generateContent`,
      {
        method: 'POST',
        headers: this.headers(apiKey),
        body: JSON.stringify(this.body(req)),
      },
      CHAT_TIMEOUT_MS,
    );

    const content = textOf(res);
    if (!content) {
      const reason = res.promptFeedback?.blockReason ?? res.candidates?.[0]?.finishReason;
      throw new ProviderRequestError(
        reason ? `Provider returned no reply (${reason})` : 'Provider returned an empty reply',
      );
    }
    return {
      content,
      promptTokens: res.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: res.usageMetadata?.candidatesTokenCount ?? 0,
    };
  }

  async *chatStream(
    { apiKey, baseUrl }: ProviderConnection,
    req: ChatRequest,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const res = await requestStream(
      `${this.base(baseUrl)}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`,
      { method: 'POST', headers: this.headers(apiKey), body: JSON.stringify(this.body(req)) },
      signal,
    );

    // Each event has the same shape as a normal reply; usage counts are cumulative.
    for await (const data of readSseData(res)) {
      const chunk = JSON.parse(data) as GeminiGenerateResponse;
      const text = textOf(chunk);
      if (text) yield { type: 'text', text };
      if (chunk.usageMetadata) {
        yield {
          type: 'usage',
          promptTokens: chunk.usageMetadata.promptTokenCount,
          completionTokens: chunk.usageMetadata.candidatesTokenCount,
        };
      }
    }
  }

  /** Gemini calls the assistant role "model" and takes the system prompt separately. */
  private body(req: ChatRequest) {
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    return {
      contents,
      generationConfig: { maxOutputTokens: req.maxOutputTokens },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };
  }

  private headers(apiKey: string) {
    return { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
  }

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
  }
}

function textOf(res: GeminiGenerateResponse): string {
  return (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
}
