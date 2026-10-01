// Drift and anomaly detection (Phase 20): simple rolling statistics,
// no ML. A source that goes quiet or whose extraction collapses gets a
// named alert with evidence; alerts ride in source_health.diagnostics.

import { computeSourceMetrics, recordHealthCheck, type ComputedMetrics } from "./metrics";
import { assessSourceHealth } from "./assess";
import type { HealthAssessment, HealthThresholds } from "./types";
import { DEFAULT_THRESHOLDS } from "./types";
import type { QueryFn } from "../fetch/queue-store";

export type AlertCode = "DISCOVERY_VOLUME_ANOMALY" | "PARSER_DRIFT_SUSPECTED";

export interface DriftAlert {
  code: AlertCode;
  severity: "warning" | "critical";
  evidence: string[];
}

/** Median of a rolling window; null when empty. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Discovery volume check: a healthy baseline (median >= 5/day) suddenly
 * yielding nothing is critical; collapsing below 20% of a solid baseline
 * (median >= 10) is a warning. Normal fluctuation never fires.
 */
export function checkDiscoveryVolume(
  baselinePerDay: number[],
  currentTotal: number
): DriftAlert | null {
  const baseline = median(baselinePerDay);
  if (baseline == null) return null;
  if (baseline >= 5 && currentTotal === 0) {
    return {
      code: "DISCOVERY_VOLUME_ANOMALY",
      severity: "critical",
      evidence: [`discovery fell to 0/day against a baseline median of ${baseline}/day`],
    };
  }
  if (baseline >= 10 && currentTotal < 0.2 * baseline) {
    return {
      code: "DISCOVERY_VOLUME_ANOMALY",
      severity: "warning",
      evidence: [
        `discovery at ${currentTotal}/day, below 20% of the ${baseline}/day baseline median`,
      ],
    };
  }
  return null;
}

/**
 * Extraction drift check: a high baseline (median >= 0.75) collapsing to
 * <= 0.5 (drop >= 0.3, enough samples) suspects parser drift.
 */
export function checkExtractionDrift(
  baselineRates: number[],
  currentRate: number | null,
  currentSamples: number
): DriftAlert | null {
  if (currentRate == null || currentSamples < 8) return null;
  const baseline = median(baselineRates.filter((r) => r != null));
  if (baseline == null) return null;
  if (baseline >= 0.75 && currentRate <= 0.5 && baseline - currentRate >= 0.3) {
    return {
      code: "PARSER_DRIFT_SUSPECTED",
      severity: "warning",
      evidence: [
        `extraction success ${currentRate.toFixed(2)} against a ${baseline.toFixed(2)} baseline`,
      ],
    };
  }
  return null;
}

/** Per-day discovery counts for the trailing full days (excludes partial today). */
export async function discoveryBaseline(
  db: QueryFn,
  sourceId: number,
  days: number,
  now: Date = new Date()
): Promise<number[]> {
  const rows = (
    await db.query(`SELECT discovered_at FROM public.crawl_queue WHERE source_id = $1`, [sourceId])
  ).rows as Array<{ discovered_at: string | Date }>;
  const dayOf = (d: Date) => d.toISOString().slice(0, 10);
  const today = dayOf(now);
  const buckets = new Map<string, number>();
  for (let i = 1; i <= days; i++) {
    const day = new Date(now.getTime() - i * 86400000);
    buckets.set(dayOf(day), 0);
  }
  for (const row of rows) {
    const at = row.discovered_at instanceof Date ? row.discovered_at : new Date(row.discovered_at);
    if (Number.isNaN(at.getTime())) continue;
    const day = dayOf(at);
    if (day === today) continue;
    if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return [...buckets.values()];
}

/** Trailing recorded fetch-success rates, oldest first. */
export async function extractionBaseline(
  db: QueryFn,
  sourceId: number,
  limit: number
): Promise<number[]> {
  const rows = (
    await db.query(
      `SELECT fetch_success_rate FROM public.source_health
       WHERE source_id = $1 AND fetch_success_rate IS NOT NULL
       ORDER BY checked_at DESC LIMIT $2`,
      [sourceId, limit]
    )
  ).rows as Array<{ fetch_success_rate: number | string }>;
  return rows
    .map((r) =>
      typeof r.fetch_success_rate === "string" ? Number(r.fetch_success_rate) : r.fetch_success_rate
    )
    .filter((r) => Number.isFinite(r))
    .reverse();
}

export interface SourceHealthCheck {
  assessment: HealthAssessment;
  alerts: DriftAlert[];
  metrics: ComputedMetrics;
}

/**
 * One health pass: metrics → assessment → drift vs baselines → record.
 * The composed entry point the scheduled workflow calls per source.
 */
export async function checkSourceHealth(
  db: QueryFn,
  sourceId: number,
  opts: {
    windowHours?: number;
    baselineDays?: number;
    historyLimit?: number;
    thresholds?: HealthThresholds;
    now?: Date;
  } = {}
): Promise<SourceHealthCheck> {
  const {
    windowHours = 24,
    baselineDays = 14,
    historyLimit = 14,
    thresholds = DEFAULT_THRESHOLDS,
    now = new Date(),
  } = opts;
  const metrics = await computeSourceMetrics(db, sourceId, windowHours, now);
  const assessment = assessSourceHealth(
    {
      sourceId,
      now: now.toISOString(),
      windowHours,
      polls: metrics.polls,
      fetch: metrics.fetch,
      extraction: metrics.extraction,
      lastDiscoveryAt: metrics.lastDiscoveryAt,
    },
    thresholds
  );
  const alerts: DriftAlert[] = [];
  const volume = checkDiscoveryVolume(
    await discoveryBaseline(db, sourceId, baselineDays, now),
    metrics.discoveredTotal
  );
  if (volume) alerts.push(volume);
  const currentRate =
    metrics.extraction && metrics.extraction.attempted > 0
      ? metrics.extraction.succeeded / metrics.extraction.attempted
      : null;
  const drift = checkExtractionDrift(
    await extractionBaseline(db, sourceId, historyLimit),
    currentRate,
    metrics.extraction?.attempted ?? 0
  );
  if (drift) alerts.push(drift);
  await recordHealthCheck(db, assessment, metrics, alerts);
  return { assessment, alerts, metrics };
}
