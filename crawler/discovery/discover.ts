// Discovery orchestration (Phase 4).
//
// Polls a source's endpoints in discovery order (RSS → Atom → news
// sitemap → sitemap → WordPress API → section), parses entries, applies
// per-endpoint checkpoints, caps intake at the safety limit, and shapes
// idempotent queue rows. Never fetches article bodies; never classifies.
import {
  DEFAULT_MAX_URLS_PER_SOURCE_PER_RUN,
  ENDPOINT_ORDER,
  type CheckpointUpdate,
  type DiscoveryEndpoint,
  type DiscoveryEntry,
  type EndpointResult,
  type EndpointType,
} from "./types";
import { parseFeed } from "./parse-feed";
import { parseSitemap } from "./parse-sitemap";
import { parseWordPress } from "./parse-wordpress";
import { parseSection } from "./parse-section";
import { applyCheckpoint, nextCheckpoint } from "../queues/checkpoints";
import { toQueueRows, type QueueRow } from "../queues/enqueue";

export interface FetchedResource {
  status: number;
  contentType: string;
  text: string;
}

export type Fetcher = (url: string) => Promise<FetchedResource>;

const FETCH_TIMEOUT_MS = 30000;

/** Default fetcher over global fetch. Discovery channels only. */
export const defaultFetcher: Fetcher = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ProjectBiharBot/0.1; +discovery)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    return {
      status: res.status,
      contentType: res.headers.get("content-type") ?? "",
      text: await res.text(),
    };
  } finally {
    clearTimeout(timer);
  }
};

/** Follows at most this many child sitemaps per index poll. */
export const MAX_SITEMAP_CHILDREN = 25;

function looksXml(text: string): boolean {
  return text.trimStart().startsWith("<");
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function orderEndpoints(endpoints: DiscoveryEndpoint[]): DiscoveryEndpoint[] {
  return [...endpoints].sort(
    (a, b) =>
      ENDPOINT_ORDER[a.endpoint_type] - ENDPOINT_ORDER[b.endpoint_type] ||
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
  );
}

async function pollEndpoint(
  endpoint: DiscoveryEndpoint,
  sourceDomain: string,
  fetcher: Fetcher
): Promise<{ entries: DiscoveryEntry[]; error?: string }> {
  let res: FetchedResource;
  try {
    res = await fetcher(endpoint.url);
  } catch (e) {
    return { entries: [], error: `fetch-failed: ${String(e).slice(0, 160)}` };
  }
  if (res.status < 200 || res.status >= 300) {
    return { entries: [], error: `http-${res.status}` };
  }

  const type = endpoint.endpoint_type;
  try {
    switch (type) {
      case "rss":
      case "atom":
        if (!looksXml(res.text)) return { entries: [], error: "unexpected-content: not XML" };
        return { entries: parseFeed(res.text, endpoint.url, type) };
      case "news_sitemap":
      case "sitemap": {
        if (!looksXml(res.text)) return { entries: [], error: "unexpected-content: not XML" };
        const parsed = parseSitemap(res.text, endpoint.url, type);
        const entries = [...parsed.entries];
        for (const child of parsed.children.slice(0, MAX_SITEMAP_CHILDREN)) {
          try {
            const cres = await fetcher(child);
            if (cres.status < 200 || cres.status >= 300 || !looksXml(cres.text)) continue;
            entries.push(...parseSitemap(cres.text, child, type).entries);
          } catch {
            continue;
          }
        }
        return { entries };
      }
      case "wordpress_api":
        return { entries: parseWordPress(res.text) };
      case "section":
        return { entries: parseSection(res.text, endpoint.url, sourceDomain, endpoint) };
      default:
        return { entries: [], error: `unknown-endpoint-type: ${type as string}` };
    }
  } catch (e) {
    return { entries: [], error: `parse-failed: ${String(e).slice(0, 160)}` };
  }
}

export interface SourceInfo {
  id: number;
  domain: string;
  priority: string;
}

export interface DiscoverSourceOptions {
  maxUrls?: number;
  fetcher?: Fetcher;
  now?: Date;
}

export interface SourceDiscovery {
  entries: DiscoveryEntry[];
  queueRows: QueueRow[];
  endpointResults: EndpointResult[];
  checkpoints: Record<string, CheckpointUpdate>;
  /** Fresh entries beyond the safety limit; re-walked next run. */
  deferred: number;
  discovered: number;
}

export async function discoverSource(
  source: SourceInfo,
  endpoints: DiscoveryEndpoint[],
  opts: DiscoverSourceOptions = {}
): Promise<SourceDiscovery> {
  const maxUrls = opts.maxUrls ?? DEFAULT_MAX_URLS_PER_SOURCE_PER_RUN;
  const fetcher = opts.fetcher ?? defaultFetcher;
  const now = opts.now ?? new Date();

  const endpointResults: EndpointResult[] = [];
  const checkpoints: Record<string, CheckpointUpdate> = {};
  const taken: DiscoveryEntry[] = [];
  let deferred = 0;
  let budget = maxUrls;

  for (const endpoint of orderEndpoints(endpoints)) {
    const poll = await pollEndpoint(endpoint, source.domain, fetcher);
    const error = poll.error;
    const pattern =
      endpoint.include_pattern && endpoint.endpoint_type !== "section"
        ? new RegExp(endpoint.include_pattern)
        : null;
    const entries = pattern
      ? poll.entries.filter((e) => pattern.test(e.url + " " + (e.title ?? "")))
      : poll.entries;
    endpointResults.push({
      endpoint_type: endpoint.endpoint_type as EndpointType,
      url: endpoint.url,
      ok: !error,
      entries: entries.length,
      ...(error ? { error } : {}),
    });
    if (error) continue; // Failed poll: cursor untouched, retried next run.

    const { fresh, deferred: endpointDeferred } = applyCheckpoint(entries, endpoint, budget);
    deferred += endpointDeferred;
    budget -= fresh.length;
    taken.push(...fresh);

    if (fresh.length === 0) {
      checkpoints[endpoint.url] = {
        last_seen_url: endpoint.last_seen_url,
        last_seen_published_at: endpoint.last_seen_published_at,
        last_success_at: now.toISOString(),
      };
    } else {
      checkpoints[endpoint.url] = nextCheckpoint(fresh, endpointDeferred > 0, now);
    }
  }

  return {
    entries: taken,
    queueRows: toQueueRows(taken, source.id, source.priority),
    endpointResults,
    checkpoints,
    deferred,
    discovered: taken.length,
  };
}
