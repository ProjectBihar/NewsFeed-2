// Fetch batch runners (Phase 5 HTTP, Phase 6 browser fallback).
//
// One bounded batch: release stale claims (crash recovery) → claim due
// rows → download concurrently via Crawlee → persist every outcome.
// The DB is the durable queue; Crawlee runs on per-batch scratch storage,
// dropped afterwards (GitHub Actions runners are ephemeral anyway).
import type { FetchConfig } from "./config";
import { DomainThrottle } from "./domain-throttle";
import {
  claimDueRows,
  recordFetchResult,
  releaseStaleClaims,
  type ClaimedRow,
  type QueryFn,
} from "./queue-store";
import { claimBrowserRows } from "./browser-policy";
import { createFetchCrawler, type FetchResult } from "./fetcher";
import { createBrowserCrawler } from "./browser-fetcher";
import { storeTempDocument } from "../retention/temp-store";

export interface BatchOptions {
  db: QueryFn;
  config: FetchConfig;
  batchSize: number;
  /** Claims older than this are considered crashed and released. */
  staleAfterSecs?: number;
  quiet?: boolean;
}

export interface BatchSummary {
  claimed: number;
  releasedStale: number;
  succeeded: number;
  retried: number;
  failed: number;
  blocked: number;
  rejected: number;
  /** Successful responses copied into temp_documents (Phase 35). */
  tempStored: number;
  /** Temp-storage writes that failed (queue outcomes are unaffected). */
  tempStoreFailed: number;
}

export interface BatchResult {
  summary: BatchSummary;
  /** Every recorded outcome, in completion order (Phase 7 consumes these). */
  results: FetchResult[];
}

interface CrawlerLike {
  run(
    requests: Array<{
      url: string;
      uniqueKey: string;
      userData: Record<string, unknown>;
      headers: Record<string, string>;
    }>
  ): Promise<unknown>;
  getRequestQueue(): Promise<{ drop(): Promise<unknown> }>;
}

async function runBatch(
  opts: BatchOptions,
  claim: (db: QueryFn, limit: number) => Promise<ClaimedRow[]>,
  createCrawler: (record: (result: FetchResult) => Promise<void>) => CrawlerLike
): Promise<BatchResult> {
  const { db, config, batchSize } = opts;
  const summary: BatchSummary = {
    claimed: 0,
    releasedStale: 0,
    succeeded: 0,
    retried: 0,
    failed: 0,
    blocked: 0,
    rejected: 0,
    tempStored: 0,
    tempStoreFailed: 0,
  };

  summary.releasedStale = await releaseStaleClaims(db, opts.staleAfterSecs ?? 600);
  const rows = await claim(db, batchSize);
  summary.claimed = rows.length;
  if (rows.length === 0) return { summary, results: [] };

  const attemptsById = new Map(rows.map((r) => [r.id, r.attempts]));
  const results: FetchResult[] = [];
  const crawler = createCrawler(async (result) => {
    results.push(result);
  });

  await crawler.run(
    rows.map((r) => ({
      url: r.url,
      uniqueKey: r.canonical_url,
      userData: { queueId: r.id, official: r.source_type === "official" },
      headers: { "User-Agent": config.userAgent },
    }))
  );

  // Drop the batch's scratch queue: the DB holds every outcome, and local
  // files must not accumulate on long-lived machines.
  try {
    await (await crawler.getRequestQueue()).drop();
  } catch {
    /* scratch cleanup is best-effort; outcomes are already safe */
  }

  const seen = new Set<number>();
  for (const result of results) {
    seen.add(result.queueId);
    const recorded = await recordFetchResult(
      db,
      result.queueId,
      attemptsById.get(result.queueId) ?? 1,
      {
        decision: result.outcome.decision,
        reason: result.outcome.reason,
        retryAfterSecs: result.outcome.retryAfterSecs,
      },
      config
    );
    switch (recorded) {
      case "fetched":
        summary.succeeded += 1;
        break;
      case "retry":
        summary.retried += 1;
        break;
      case "failed":
        summary.failed += 1;
        break;
      case "blocked":
        summary.blocked += 1;
        break;
      case "rejected":
        summary.rejected += 1;
        break;
    }

    // Phase 35: a successful response's raw HTML goes to TEMPORARY storage
    // (expires in RETENTION_DAYS, never into permanent rows). Best-effort
    // by design — the queue outcome above is already durable, so a storage
    // hiccup is counted and surfaced rather than thrown mid-batch.
    if (recorded === "fetched" && result.html) {
      try {
        await storeTempDocument(db, {
          url: result.url,
          queueId: result.queueId,
          rawHtml: result.html,
        });
        summary.tempStored += 1;
      } catch {
        summary.tempStoreFailed += 1;
      }
    }
  }

  // Safety net: a claimed row with no recorded outcome (e.g. a Crawlee
  // skip path) goes back to retry rather than stranding in 'fetching'.
  for (const row of rows) {
    if (!seen.has(row.id)) {
      await recordFetchResult(
        db,
        row.id,
        attemptsById.get(row.id) ?? 1,
        { decision: "retry", reason: "no-outcome-recorded" },
        config
      );
      summary.retried += 1;
    }
  }

  return { summary, results };
}

/** HTTP batch over all due rows (Phase 5). */
export function fetchBatch(opts: BatchOptions): Promise<BatchResult> {
  return runBatch(opts, claimDueRows, (record) =>
    createFetchCrawler({
      config: opts.config,
      throttle: new DomainThrottle(opts.config.perDomainConcurrency),
      record,
      quiet: opts.quiet,
    })
  );
}

/**
 * Browser batch over requires_browser rows only (Phase 6).
 * HTTP-friendly sources never enter this path.
 */
export function fetchBrowserBatch(opts: BatchOptions): Promise<BatchResult> {
  return runBatch(opts, claimBrowserRows, (record) =>
    createBrowserCrawler({
      config: opts.config,
      throttle: new DomainThrottle(opts.config.perDomainConcurrency),
      record,
      quiet: opts.quiet,
    })
  );
}
