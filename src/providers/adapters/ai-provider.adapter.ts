import { AiProviderType } from '@prisma/client';

export interface ProviderConnection {
  apiKey: string;
  /** Overrides the vendor's default API URL (e.g. an OpenAI-compatible gateway). */
  baseUrl?: string | null;
}

/** One implementation per AI vendor. Callers only depend on this interface. */
export interface AiProviderAdapter {
  readonly type: AiProviderType;

  /** Makes a cheap authenticated call (list models). Throws ProviderRequestError on failure. */
  checkHealth(connection: ProviderConnection): Promise<void>;
}
