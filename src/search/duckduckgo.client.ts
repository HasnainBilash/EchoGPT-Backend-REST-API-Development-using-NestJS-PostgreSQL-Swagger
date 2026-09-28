import { Injectable, Logger } from '@nestjs/common';

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

interface DdgTopic {
  Text?: string;
  FirstURL?: string;
  Topics?: DdgTopic[];
}

interface DdgResponse {
  Heading?: string;
  AbstractText?: string;
  AbstractURL?: string;
  AbstractSource?: string;
  Answer?: string;
  Definition?: string;
  DefinitionURL?: string;
  DefinitionSource?: string;
  Results?: DdgTopic[];
  RelatedTopics?: DdgTopic[];
}

export class SearchEngineError extends Error {}

export const MAX_RESULTS = 10;
const USER_AGENT = 'EchoGPT-Backend/1.0';

/**
 * DuckDuckGo's free, keyless APIs: Instant Answer (topic summaries + related links) and
 * autocomplete. Instant Answer is not a full web index — question-style queries often return
 * no results, which the API reports as an empty list rather than an error.
 */
@Injectable()
export class DuckDuckGoClient {
  readonly engine = 'duckduckgo';
  private readonly logger = new Logger(DuckDuckGoClient.name);

  async search(query: string): Promise<SearchResultItem[]> {
    // Lower-cased: the API sometimes answers mixed-case queries ("NestJS") with an empty body.
    const url =
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query.toLowerCase())}` +
      '&format=json&no_html=1&skip_disambig=1&t=echogpt';

    let data: DdgResponse;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const text = await res.text();
      // An empty 200 means "no instant answer", not an outage.
      data = text.trim() ? (JSON.parse(text) as DdgResponse) : {};
    } catch (err) {
      this.logger.warn(`DuckDuckGo search failed: ${(err as Error).message}`);
      throw new SearchEngineError('The search engine is unreachable right now');
    }

    return this.normalize(query, data);
  }

  /** Best effort: returns [] on any failure so suggestions still work from history. */
  async suggest(prefix: string): Promise<string[]> {
    try {
      const res = await fetch(
        `https://duckduckgo.com/ac/?q=${encodeURIComponent(prefix)}&type=list`,
        { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(3_000) },
      );
      if (!res.ok) return [];
      const body = (await res.json()) as [string, string[]];
      return Array.isArray(body?.[1]) ? body[1].filter((s) => typeof s === 'string') : [];
    } catch {
      return [];
    }
  }

  private normalize(query: string, data: DdgResponse): SearchResultItem[] {
    const items: SearchResultItem[] = [];
    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

    if (data.Answer) {
      items.push({
        title: 'Instant answer',
        url: searchUrl,
        snippet: data.Answer,
        source: 'DuckDuckGo',
      });
    }
    if (data.AbstractText && data.AbstractURL) {
      items.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.AbstractText,
        source: data.AbstractSource || 'DuckDuckGo',
      });
    }
    if (data.Definition && data.DefinitionURL) {
      items.push({
        title: `Definition: ${data.Heading || query}`,
        url: data.DefinitionURL,
        snippet: data.Definition,
        source: data.DefinitionSource || 'DuckDuckGo',
      });
    }

    const topics = [...(data.Results ?? []), ...flatten(data.RelatedTopics ?? [])];
    for (const topic of topics) {
      if (!topic.Text || !topic.FirstURL) continue;
      // Topic text looks like "Title - description".
      const [title, ...rest] = topic.Text.split(' - ');
      items.push({
        title: title.trim(),
        url: topic.FirstURL,
        snippet: rest.join(' - ').trim() || topic.Text,
        source: 'DuckDuckGo',
      });
    }

    const seen = new Set<string>();
    return items.filter((i) => !seen.has(i.url) && seen.add(i.url)).slice(0, MAX_RESULTS);
  }
}

function flatten(topics: DdgTopic[]): DdgTopic[] {
  return topics.flatMap((t) => (t.Topics ? flatten(t.Topics) : [t]));
}
