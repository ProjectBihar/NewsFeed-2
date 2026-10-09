// Shared discovery types (Phase 4). No fetching, no classification here.

export type EndpointType =
  "rss" | "atom" | "news_sitemap" | "sitemap" | "wordpress_api" | "section";

/** Discovery order rank: RSS first, section page last. */
export const ENDPOINT_ORDER: Record<EndpointType, number> = {
  rss: 0,
  atom: 1,
  news_sitemap: 2,
  sitemap: 3,
  wordpress_api: 4,
  section: 5,
};

export interface DiscoveryEndpoint {
  endpoint_type: EndpointType;
  url: string;
  priority: string;
  include_pattern?: string | null;
  allow_pdf?: boolean;
  /** Checkpoint cursor: stop walk when this URL reappears (first run: null). */
  last_seen_url: string | null;
  /** Checkpoint cursor: skip entries at/before this time (first run: null). */
  last_seen_published_at: string | null;
}

export interface DiscoveryEntry {
  /** Absolute URL exactly as published (normalisation happens later). */
  url: string;
  publishedAt: Date | null;
  title: string | null;
  via: EndpointType;
}

export interface EndpointResult {
  endpoint_type: EndpointType;
  url: string;
  ok: boolean;
  entries: number;
  error?: string;
}

/** Safety limit: genuinely new URLs processed per source per run. */
export const DEFAULT_MAX_URLS_PER_SOURCE_PER_RUN = 250;

export interface CheckpointUpdate {
  last_seen_url: string | null;
  last_seen_published_at: string | null;
  /** Always set on a successful poll, even with zero new entries. */
  last_success_at: string;
}
