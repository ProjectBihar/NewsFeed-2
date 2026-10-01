// Pure admin shaping helpers (Phase 21). IO lives in queries.ts;
// everything here is unit-tested against fixture rows.

export type HealthState = "HEALTHY" | "DEGRADED" | "BROKEN" | "STALE" | "BLOCKED";

export interface HealthRow {
  source_id: number;
  health_state: HealthState;
  checked_at: string;
}

export interface CrawlRunRow {
  id: number;
  started_at: string;
  completed_at: string | null;
  status: string;
  sources_attempted: number;
  sources_succeeded: number;
  urls_discovered: number;
  urls_fetched: number;
  articles_extracted: number;
  articles_relevant: number;
  stories_created: number;
  errors: number;
}

/** Latest health row per source, by checked_at (input order irrelevant). */
export function latestHealthPerSource(rows: HealthRow[]): Map<number, HealthRow> {
  const latest = new Map<number, HealthRow>();
  for (const row of rows) {
    const current = latest.get(row.source_id);
    if (!current || row.checked_at >= current.checked_at) {
      latest.set(row.source_id, row);
    }
  }
  return latest;
}

/** Source counts by state; sources without rows count as unknown. */
export function countByState(
  latest: Map<number, HealthRow>,
  sourceIds: number[]
): Record<HealthState | "UNKNOWN", number> {
  const counts: Record<HealthState | "UNKNOWN", number> = {
    HEALTHY: 0,
    DEGRADED: 0,
    BROKEN: 0,
    STALE: 0,
    BLOCKED: 0,
    UNKNOWN: 0,
  };
  for (const id of sourceIds) {
    const row = latest.get(id);
    counts[row ? row.health_state : "UNKNOWN"] += 1;
  }
  return counts;
}

/** Human relative time for admin tables ("42m ago", "3h ago", "5d ago"). */
export function timeAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "never";
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Low-confidence classification cutoff for the review list. */
export const LOW_CLASSIFICATION_CONFIDENCE = 0.6;

export function isLowClassification(confidence: number | null): boolean {
  return confidence != null && confidence < LOW_CLASSIFICATION_CONFIDENCE;
}
