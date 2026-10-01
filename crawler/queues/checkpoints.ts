// Endpoint checkpoints (Phase 4).
//
// Walk entries newest-first, collecting while they are newer than the
// cursor. Stop at the remembered last_seen_url or at entries at/before
// last_seen_published_at. First run (no cursor) takes everything up to
// the safety limit.
import {
  DEFAULT_MAX_URLS_PER_SOURCE_PER_RUN,
  type CheckpointUpdate,
  type DiscoveryEndpoint,
  type DiscoveryEntry,
} from "../discovery/types";

export interface Checkpointed {
  /** Genuinely new entries, newest first, capped at the safety limit. */
  fresh: DiscoveryEntry[];
  /** Entries beyond the cap: counted for metrics, re-walked next run. */
  deferred: number;
}

export function applyCheckpoint(
  entries: DiscoveryEntry[],
  cursor: Pick<DiscoveryEndpoint, "last_seen_url" | "last_seen_published_at">,
  maxUrls: number = DEFAULT_MAX_URLS_PER_SOURCE_PER_RUN
): Checkpointed {
  const since = cursor.last_seen_published_at ? Date.parse(cursor.last_seen_published_at) : NaN;
  const hasSince = !Number.isNaN(since);

  const fresh: DiscoveryEntry[] = [];
  let scanned = 0;
  for (const entry of entries) {
    if (cursor.last_seen_url && entry.url === cursor.last_seen_url) break;
    if (hasSince && entry.publishedAt && entry.publishedAt.getTime() <= since) {
      break;
    }
    scanned += 1;
    if (fresh.length < maxUrls) {
      fresh.push(entry);
    }
  }
  return { fresh, deferred: scanned - fresh.length };
}

/**
 * Advance the cursor after a poll.
 * Normal case: cursor jumps to the newest fresh entry.
 * Capped case: cursor advances only to the oldest queued entry so the
 * deferred remainder is re-walked next run (DB dedupe makes the re-walk
 * idempotent) instead of being silently skipped.
 */
export function nextCheckpoint(
  fresh: DiscoveryEntry[],
  capped: boolean,
  now: Date = new Date()
): CheckpointUpdate {
  const anchor = capped ? fresh[fresh.length - 1] : fresh[0];
  return {
    last_seen_url: anchor?.url ?? null,
    last_seen_published_at: anchor?.publishedAt?.toISOString() ?? null,
    last_success_at: now.toISOString(),
  };
}
