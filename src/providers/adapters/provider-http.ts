/**
 * Error from calling an AI vendor. `message` has the vendor's full detail (for admins/logs);
 * `summary` is the short version that is safe to show end users.
 */
export class ProviderRequestError extends Error {
  readonly summary: string;

  constructor(
    message: string,
    readonly status?: number,
    summary?: string,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
    this.summary = summary ?? message;
  }
}

export const PROVIDER_TIMEOUT_MS = 15_000;
export const CHAT_TIMEOUT_MS = 60_000;

/** fetch + JSON with a timeout, turning every failure mode into a readable ProviderRequestError. */
export async function requestJson<T>(
  url: string,
  init: RequestInit,
  timeoutMs = PROVIDER_TIMEOUT_MS,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new ProviderRequestError(`Provider did not respond within ${timeoutMs / 1000}s`);
    }
    const cause =
      err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : '';
    throw new ProviderRequestError(
      `Could not reach provider: ${cause}`,
      undefined,
      'Could not reach the AI provider',
    );
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  if (!res.ok) {
    // OpenAI, Anthropic and Gemini all use { error: { message } }.
    const vendorMessage =
      (body as { error?: { message?: string } } | undefined)?.error?.message ?? text.slice(0, 200);
    // Gemini reports a bad key as 400 "API key not valid".
    const badKey =
      res.status === 401 || res.status === 403 || /api key not valid/i.test(vendorMessage);
    const prefix = badKey
      ? 'Invalid or unauthorized API key'
      : res.status === 429
        ? 'Provider rate limit or quota exceeded'
        : 'Provider error';
    throw new ProviderRequestError(
      `${prefix} (HTTP ${res.status}): ${vendorMessage}`.slice(0, 500),
      res.status,
      `${prefix} (HTTP ${res.status})`,
    );
  }

  return body as T;
}

export const trimSlash = (url: string) => url.replace(/\/+$/, '');
