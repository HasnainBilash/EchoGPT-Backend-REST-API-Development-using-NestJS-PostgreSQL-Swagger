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
/** Whole-stream limit; long answers can take a while to generate. */
export const STREAM_TIMEOUT_MS = 180_000;

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
  const body = parseJson(text);
  if (!res.ok) {
    throw vendorError(res.status, body, text);
  }
  return body as T;
}

/**
 * Starts a streaming request. Resolves once the vendor has answered with 2xx (the body is then
 * read with `readSseData`); non-2xx answers become the same errors as `requestJson`.
 */
export async function requestStream(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal });
  } catch (err) {
    throw networkError(err);
  }
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw vendorError(res.status, parseJson(text), text);
  }
  return res;
}

/** Yields the `data:` payload of each Server-Sent Event in a streamed response body. */
export async function* readSseData(res: Response): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      let boundary: number;
      // Events are separated by a blank line; a single event may carry several data: lines.
      while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
        const data = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (data) yield data;
      }
    }
  } catch (err) {
    throw networkError(err);
  }
}

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : undefined;
  } catch {
    return undefined;
  }
}

function networkError(err: unknown): ProviderRequestError {
  if (err instanceof ProviderRequestError) return err;
  if (err instanceof Error && err.name === 'TimeoutError') {
    return new ProviderRequestError('Provider did not respond in time');
  }
  if (err instanceof Error && err.name === 'AbortError') {
    return new ProviderRequestError('Request was cancelled', undefined, 'Request was cancelled');
  }
  const cause =
    err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : '';
  return new ProviderRequestError(
    `Could not reach provider: ${cause}`,
    undefined,
    'Could not reach the AI provider',
  );
}

function vendorError(status: number, body: unknown, text: string): ProviderRequestError {
  // OpenAI, Anthropic and Gemini all use { error: { message } }.
  const vendorMessage =
    (body as { error?: { message?: string } } | undefined)?.error?.message ?? text.slice(0, 200);
  // Gemini reports a bad key as 400 "API key not valid".
  const badKey = status === 401 || status === 403 || /api key not valid/i.test(vendorMessage);
  const prefix = badKey
    ? 'Invalid or unauthorized API key'
    : status === 429
      ? 'Provider rate limit or quota exceeded'
      : 'Provider error';
  return new ProviderRequestError(
    `${prefix} (HTTP ${status}): ${vendorMessage}`.slice(0, 500),
    status,
    `${prefix} (HTTP ${status})`,
  );
}

export const trimSlash = (url: string) => url.replace(/\/+$/, '');
