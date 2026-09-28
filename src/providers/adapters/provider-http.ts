/** Error from calling an AI vendor. `status` is the vendor's HTTP status, when there was one. */
export class ProviderRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderRequestError';
  }
}

export const PROVIDER_TIMEOUT_MS = 15_000;

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
    throw new ProviderRequestError(`Could not reach provider: ${cause}`);
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
    );
  }

  return body as T;
}

export const trimSlash = (url: string) => url.replace(/\/+$/, '');
