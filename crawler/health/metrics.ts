// Health metrics from durable tables + persistence (Phase 19).
//
// crawl_queue carries fetch outcomes (statuses + last_error reasons);
// source_endpoints carries poll freshness; crawl_runs is per-run audit,
// not per-source signal, so it stays out of the per-source math.
// Extraction observability activates once a runner writes 'extracted'
// rows — until then extraction stays null and its rule sleeps.
import { classifyFailureKind } from "./failures";
import type { QueryFn } from "../fetch/queue-store";
import type { HealthAssessment } from "./types";

// PGlite returns timestamptz columns as Date objects while Supabase REST
// returns ISO strings; normalize once so comparisons always work.
function iso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    return Number.isNaN(Date.parse(value)) ? null : value;
  }
  return null;
}

export interface ComputedMetrics {
  sourceId: number;
  now: string;
  windowHours: number;
  polls: {
    attempted: number;
    succeeded: number;
    lastSuccessAt: string | null;
  };
  fetch: {
    attempted: number;
    succeeded: number;
    blocked403: number;
    rateLimited429: number;
  };
  extraction: { attempted: number; succeeded: number } | null;
  discoveredTotal: number;
  discoveredPerDay: Array<{ day: string; count: number }>;
  lastDiscoveryAt: string | null;
  failureCount: number;
}

/**
 * Poll freshness from endpoints; outcome rollups from queue rows touched
 * in the window. Attempted polls are not counted per-endpoint in the
 * schema, so poll health reads as freshness (checked vs succeeded).
 */
export async function computeSourceMetrics(
  db: QueryFn,
  sourceId: number,
  windowHours: number,
  now: Date = new Date()
): Promise<ComputedMetrics> {
  const nowIso = now.toISOString();
  const endpoints = (
    await db.query(
      `SELECT active, last_checked, last_success_at FROM public.source_endpoints WHERE source_id = $1`,
      [sourceId]
    )
  ).rows as Array<{ active: boolean; last_checked: string | null; last_success_at: string | null }>;
  const windowStart = new Date(now.getTime() - windowHours * 3600000).toISOString();
  const checked = endpoints.filter((e) => {
    const at = iso(e.last_checked);
    return at != null && at >= windowStart;
  }).length;
  const succeeded = endpoints.filter((e) => {
    const at = iso(e.last_success_at);
    return at != null && at >= windowStart;
  }).length;
  const lastSuccessAt = endpoints.reduce<string | null>((best, e) => {
    const at = iso(e.last_success_at);
    return at != null && (!best || at > best) ? at : best;
  }, null);

  const rows = (
    await db.query(
      `SELECT status, last_error, last_attempt_at, discovered_at FROM public.crawl_queue WHERE source_id = $1`,
      [sourceId]
    )
  ).rows as Array<{
    status: string;
    last_error: string | null;
    last_attempt_at: string | Date | null;
    discovered_at: string | Date;
  }>;
  const attemptedAt = (r: { last_attempt_at: string | Date | null }) => iso(r.last_attempt_at);
  const touched = rows.filter((r) => {
    const at = attemptedAt(r);
    return at != null && at >= windowStart;
  });
  const succeededFetch = touched.filter((r) => r.status === "fetched").length;
  let blocked403 = 0;
  let rateLimited429 = 0;
  let failures = 0;
  for (const row of touched) {
    if (row.status === "fetched" || row.status === "rejected") continue;
    const kind = classifyFailureKind(row.last_error);
    if (kind === "blocked403") blocked403 += 1;
    else if (kind === "rateLimited429") rateLimited429 += 1;
    if (row.status === "failed" || row.status === "blocked" || row.status === "retry") {
      failures += 1;
    }
  }
  const extracted = rows.filter((r) => {
    const at = attemptedAt(r);
    return r.status === "extracted" && at != null && at >= windowStart;
  }).length;
  const fetchedTotal = rows.filter((r) => {
    const at = attemptedAt(r);
    return (r.status === "fetched" || r.status === "extracted") && at != null && at >= windowStart;
  }).length;
  const extraction = extracted > 0 ? { attempted: fetchedTotal, succeeded: extracted } : null;

  const discovered = rows.filter((r) => {
    const at = iso(r.discovered_at);
    return at != null && at >= windowStart;
  });
  const perDay = new Map<string, number>();
  for (const row of discovered) {
    const day = (iso(row.discovered_at) ?? "").slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const lastDiscoveryAt = rows.reduce<string | null>((best, r) => {
    const at = iso(r.discovered_at);
    return at != null && (!best || at > best) ? at : best;
  }, null);

  return {
    sourceId,
    now: nowIso,
    windowHours,
    polls: { attempted: checked, succeeded, lastSuccessAt },
    fetch: {
      attempted: touched.length,
      succeeded: succeededFetch,
      blocked403,
      rateLimited429,
    },
    extraction,
    discoveredTotal: discovered.length,
    discoveredPerDay: [...perDay.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => (a.day < b.day ? -1 : 1)),
    lastDiscoveryAt,
    failureCount: failures,
  };
}

/** Persist one health check row; returns its id. */
export async function recordHealthCheck(
  db: QueryFn,
  assessment: HealthAssessment,
  metrics: ComputedMetrics,
  alerts: Array<{ code: string; severity: string; evidence: string[] }> = []
): Promise<number> {
  const fetchRate =
    metrics.fetch.attempted > 0 ? metrics.fetch.succeeded / metrics.fetch.attempted : null;
  const extractionRate =
    metrics.extraction && metrics.extraction.attempted > 0
      ? metrics.extraction.succeeded / metrics.extraction.attempted
      : null;
  const rows = await db.query(
    `INSERT INTO public.source_health
     (source_id, checked_at, fetch_success_rate, extraction_success_rate,
      articles_discovered, http_403_count, http_429_count, failure_count,
      health_state, diagnostics)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      assessment.sourceId,
      assessment.checkedAt,
      fetchRate,
      extractionRate,
      metrics.discoveredTotal,
      metrics.fetch.blocked403,
      metrics.fetch.rateLimited429,
      metrics.failureCount,
      assessment.state,
      JSON.stringify({
        reasons: assessment.reasons,
        windowHours: metrics.windowHours,
        polls: metrics.polls,
        discoveredPerDay: metrics.discoveredPerDay,
        lastDiscoveryAt: metrics.lastDiscoveryAt,
        alerts,
      }),
    ]
  );
  return (rows.rows[0] as { id: number }).id;
}

/** Latest recorded state for a source (null when never checked). */
export async function latestHealth(
  db: QueryFn,
  sourceId: number
): Promise<{ health_state: string; checked_at: string } | null> {
  const rows = await db.query(
    `SELECT health_state, checked_at FROM public.source_health
     WHERE source_id = $1 ORDER BY checked_at DESC LIMIT 1`,
    [sourceId]
  );
  return (rows.rows[0] as { health_state: string; checked_at: string } | undefined) ?? null;
}
