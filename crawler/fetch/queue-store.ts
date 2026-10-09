// Durable queue storage (Phase 5).
//
// crawl_queue is the crash-proof queue: rows are claimed atomically
// (FOR UPDATE SKIP LOCKED), heartbeated via last_attempt_at, and stale
// 'fetching' rows are released back to 'retry' on the next batch — so a
// crash, cancellation, or timeout never loses or duplicates work.
// (Uniqueness is additionally guarded by UNIQUE(canonical_url).)
import type { FetchConfig } from "./config";
import type { FetchDecision } from "./retry";

export interface QueryFn {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface ClaimedRow {
  id: number;
  url: string;
  canonical_url: string;
  source_id: number | null;
  priority: string;
  attempts: number;
}

const PRIORITY_ORDER = `CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

/** Atomically claim up to `limit` due rows for fetching. */
export async function claimDueRows(db: QueryFn, limit: number): Promise<ClaimedRow[]> {
  const res = await db.query(
    `UPDATE public.crawl_queue SET status = 'fetching', last_attempt_at = now(), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM public.crawl_queue
       WHERE EXISTS (SELECT 1 FROM public.sources s WHERE s.id = source_id
                     AND s.active AND NOT s.requires_browser)
         AND (status = 'discovered' OR status = 'queued'
              OR (status = 'retry' AND (next_retry_at IS NULL OR next_retry_at <= now())))
       ORDER BY ${PRIORITY_ORDER}, discovered_at
       FOR UPDATE SKIP LOCKED
       LIMIT $1
     )
     RETURNING id, url, canonical_url, source_id, priority, attempts`,
    [limit]
  );
  return res.rows as unknown as ClaimedRow[];
}

/** Exponential backoff with ceiling. An explicit server Retry-After is
 * honoured exactly (it is a directive, not our estimate); the ceiling
 * governs only our own exponential schedule. */
export function computeBackoffSecs(
  attempts: number,
  config: Pick<FetchConfig, "baseBackoffSecs" | "maxBackoffSecs">,
  retryAfterSecs?: number
): number {
  if (retryAfterSecs != null) {
    return Math.min(Math.max(Math.round(retryAfterSecs), 1), 3600);
  }
  return Math.min(config.baseBackoffSecs * 2 ** Math.max(0, attempts - 1), config.maxBackoffSecs);
}

export interface RecordedOutcome {
  decision: FetchDecision;
  reason: string;
  retryAfterSecs?: number;
}

/** Persist a fetch outcome; retry honours the attempt cap, 403 parks separately.
 * Returns the recorded queue status so callers report reality, not intent
 * (a "retry" decision at the cap records — and must count as — 'failed'). */
export async function recordFetchResult(
  db: QueryFn,
  rowId: number,
  attempts: number,
  outcome: RecordedOutcome,
  config: Pick<FetchConfig, "maxAttempts" | "baseBackoffSecs" | "maxBackoffSecs">
): Promise<"fetched" | "retry" | "failed" | "blocked" | "rejected"> {
  switch (outcome.decision) {
    case "success":
      await db.query(
        `UPDATE public.crawl_queue SET status = 'fetched', last_error = NULL WHERE id = $1`,
        [rowId]
      );
      return "fetched";
    case "permanent":
      await db.query(
        `UPDATE public.crawl_queue SET status = 'failed', last_error = $2 WHERE id = $1`,
        [rowId, outcome.reason]
      );
      return "failed";
    case "blocked":
      await db.query(
        `UPDATE public.crawl_queue SET status = 'blocked', last_error = $2 WHERE id = $1`,
        [rowId, outcome.reason]
      );
      return "blocked";
    case "reject-content":
      await db.query(
        `UPDATE public.crawl_queue SET status = 'rejected', last_error = $2 WHERE id = $1`,
        [rowId, outcome.reason]
      );
      return "rejected";
    case "retry": {
      if (attempts >= config.maxAttempts) {
        await db.query(
          `UPDATE public.crawl_queue SET status = 'failed', last_error = $2 WHERE id = $1`,
          [rowId, `attempts-exhausted: ${outcome.reason}`]
        );
        return "failed";
      }
      const backoff = computeBackoffSecs(attempts, config, outcome.retryAfterSecs);
      await db.query(
        `UPDATE public.crawl_queue SET status = 'retry', last_error = $2,
         next_retry_at = now() + make_interval(secs => $3) WHERE id = $1`,
        [rowId, outcome.reason, backoff]
      );
      return "retry";
    }
  }
}

/**
 * Crash recovery: rows stuck in 'fetching' longer than `staleAfterSecs`
 * (dead worker, cancelled run) go back to 'retry' immediately.
 */
export async function releaseStaleClaims(db: QueryFn, staleAfterSecs: number): Promise<number> {
  const res = await db.query(
    `UPDATE public.crawl_queue SET status = 'retry', next_retry_at = now(),
     last_error = 'stale-claim-released'
     WHERE status = 'fetching' AND last_attempt_at < now() - make_interval(secs => $1)
     RETURNING id`,
    [staleAfterSecs]
  );
  return res.rows.length;
}
