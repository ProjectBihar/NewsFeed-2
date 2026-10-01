// Queue-row shaping for discovered URLs (Phase 4).
// Persistence itself (the INSERT) runs in the Phase 5 runner; this module
// builds validated rows plus the idempotent INSERT text it uses.
import { normaliseUrl } from "../normalisation/normalise-url";
import type { DiscoveryEntry } from "../discovery/types";

export interface QueueRow {
  url: string;
  canonical_url: string;
  source_id: number;
  discovery_method: string;
  status: "discovered";
  priority: string;
}

/** Normalise + dedupe entries, shaping one row per distinct canonical URL. */
export function toQueueRows(
  entries: DiscoveryEntry[],
  sourceId: number,
  priority: string,
  baseUrl?: string
): QueueRow[] {
  const rows: QueueRow[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const canonical = normaliseUrl(entry.url, baseUrl);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    rows.push({
      url: entry.url,
      canonical_url: canonical,
      source_id: sourceId,
      discovery_method: entry.via,
      status: "discovered",
      priority,
    });
  }
  return rows;
}

/**
 * Idempotent multi-row INSERT. Re-polling an endpoint re-discovers URLs;
 * ON CONFLICT drops them without error, so the queue never holds
 * technical duplicates.
 */
export function buildEnqueueQuery(rows: QueueRow[]): {
  text: string;
  values: Array<string | number>;
} {
  const values: Array<string | number> = [];
  const tuples = rows.map((r, i) => {
    const o = i * 5;
    values.push(r.url, r.canonical_url, r.source_id, r.discovery_method, r.priority);
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, 'discovered', $${o + 5})`;
  });
  return {
    text:
      `INSERT INTO public.crawl_queue (url, canonical_url, source_id, discovery_method, status, priority) VALUES ` +
      tuples.join(", ") +
      ` ON CONFLICT (canonical_url) DO NOTHING`,
    values,
  };
}
