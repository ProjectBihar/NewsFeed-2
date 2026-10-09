// Browser-routing policy (Phase 6).
//
// Browser mode is opt-in per source, never automatic: a 403/blocked
// history does NOT escalate a source by itself. An operator sets
// requires_browser in data/sources/registry.json only with evidence
// (e.g. a probe showing HTTP blocked but Chromium rendering), and the
// flag ships via migration 20260928000003.
import type { QueryFn } from "./queue-store";
import type { ClaimedRow } from "./queue-store";

export interface RoutableSource {
  requires_browser: boolean;
}

/** Browser iff the operator flag says so. Nothing else qualifies. */
export function requiresBrowser(source: RoutableSource): boolean {
  return source.requires_browser === true;
}

const PRIORITY_ORDER = `CASE q.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`;

/** Claim due rows belonging to browser-flagged sources only. */
export async function claimBrowserRows(db: QueryFn, limit: number): Promise<ClaimedRow[]> {
  const res = await db.query(
    `UPDATE public.crawl_queue SET status = 'fetching', last_attempt_at = now(), attempts = attempts + 1
     WHERE id IN (
       SELECT q.id FROM public.crawl_queue q
       JOIN public.sources s ON s.id = q.source_id
       WHERE s.requires_browser = TRUE AND s.active = TRUE
         AND (q.status = 'discovered' OR q.status = 'queued'
              OR (q.status = 'retry' AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())))
       ORDER BY ${PRIORITY_ORDER}, q.discovered_at
       FOR UPDATE OF q SKIP LOCKED
       LIMIT $1
     )
     RETURNING id, url, canonical_url, source_id, priority, attempts`,
    [limit]
  );
  return res.rows as unknown as ClaimedRow[];
}
