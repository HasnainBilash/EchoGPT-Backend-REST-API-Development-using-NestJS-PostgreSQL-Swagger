import { Injectable } from '@nestjs/common';
import { AiProviderType } from '@prisma/client';
import {
  AiProviderAdapter,
  ChatRequest,
  ChatResult,
  ProviderConnection,
} from './ai-provider.adapter';
import { CHAT_TIMEOUT_MS, ProviderRequestError, requestJson, trimSlash } from './provider-http';

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
    const system = req.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    // Gemini calls the assistant role "model".
    const contents = req.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const res = await requestJson<GeminiGenerateResponse>(
      `${this.base(baseUrl)}/models/${encodeURIComponent(req.model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents,
          generationConfig: { maxOutputTokens: req.maxOutputTokens },
          ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        }),
      },
      CHAT_TIMEOUT_MS,
    );

    const content = (res.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
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

  private base(baseUrl?: string | null) {
    return trimSlash(baseUrl || 'https://generativelanguage.googleapis.com/v1beta');
  }
}
