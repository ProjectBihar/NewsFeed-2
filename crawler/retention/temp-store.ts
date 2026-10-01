// Temporary document storage (Phase 35 — Storage Retention).
//
// Raw HTML and extracted bodies are the plan's TEMPORARY payloads: they
// expire (10 days — inside the plan's recommended 7–14-day window) and the
// public archive never reads them. Every fact the archive needs lives in
// permanent rows that this module never writes.
//
// Expiry is FIXED at first store: an upsert merges payload fields into the
// existing row without sliding the window, so a daily-crawled page cannot
// keep its HTML alive forever — the plan's goal is bounding storage, not
// caching. Exemption (keepReason) is the plan's "longer only where needed"
// valve and makes the row exempt from automatic expiry entirely.
import type { QueryFn } from "../fetch/queue-store";

/** Initial retention policy. The plan recommends 7–14 days; pick the middle. */
export const RETENTION_DAYS = 10;

/** The plan's three allowed reasons for outlasting automatic retention. */
export type KeepReason = "regression_fixture" | "manual_review" | "debugging";

export interface TempDocumentInput {
  /** Document key — one temp document per URL (upsert target). */
  url: string;
  queueId?: number | null;
  articleId?: number | null;
  rawHtml?: string | null;
  /** Full extracted article body (writer lands with fetch→extract→store). */
  body?: string | null;
  /** Claims exemption from automatic retention; expires_at becomes NULL. */
  keepReason?: KeepReason | null;
  /** Override the default window in days (callers should stay in 7–14). */
  retentionDays?: number;
}

export interface StoredTempDocument {
  id: number;
  /** ISO timestamp, or null when the document is exempt. */
  expiresAt: string | null;
  keepReason: string | null;
}

/**
 * Insert or merge one temporary document.
 *
 * - New rows get expires_at = now() + retentionDays (or NULL when claiming
 *   keepReason — exemption must be an explicit, visible decision).
 * - Existing rows merge: provided payload fields win, omitted ones are kept,
 *   and expires_at / keep_reason are never modified (the window was fixed
 *   at first store; releasing an exemption is an explicit UPDATE elsewhere).
 */
export async function storeTempDocument(
  db: QueryFn,
  input: TempDocumentInput
): Promise<StoredTempDocument> {
  if (!input.rawHtml && !input.body) {
    throw new Error(`temp document for ${input.url} needs rawHtml or body`);
  }
  const keepReason = input.keepReason ?? null;
  const res = await db.query(
    `INSERT INTO public.temp_documents
       (url, queue_id, article_id, raw_html, body, keep_reason, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6,
             CASE WHEN $6::text IS NULL
                  THEN now() + make_interval(days => $7::int)
                  ELSE NULL
             END)
     ON CONFLICT (url) DO UPDATE SET
       raw_html   = COALESCE(EXCLUDED.raw_html, public.temp_documents.raw_html),
       body       = COALESCE(EXCLUDED.body, public.temp_documents.body),
       article_id = COALESCE(EXCLUDED.article_id, public.temp_documents.article_id),
       queue_id   = COALESCE(EXCLUDED.queue_id, public.temp_documents.queue_id)
     RETURNING id, expires_at, keep_reason`,
    [
      input.url,
      input.queueId ?? null,
      input.articleId ?? null,
      input.rawHtml ?? null,
      input.body ?? null,
      keepReason,
      input.retentionDays ?? RETENTION_DAYS,
    ]
  );
  const row = res.rows[0];
  if (!row) throw new Error(`failed to store temp document for ${input.url}`);
  // PGlite hands back Date objects for timestamptz — normalise to ISO.
  const iso = (value: unknown): string =>
    value instanceof Date ? value.toISOString() : String(value);
  return {
    id: Number(row.id),
    expiresAt: row.expires_at == null ? null : iso(row.expires_at),
    keepReason: row.keep_reason == null ? null : String(row.keep_reason),
  };
}

export interface RetentionReport {
  deleted: number;
  remaining: number;
  exempt: number;
  ranAt: string;
}

/**
 * Run the scheduled cleanup: delete expired temp documents and nothing
 * else. Thin wrapper over the `run_retention_cleanup` SQL function so the
 * script, the tests, and future scheduled callers share one code path.
 */
export async function purgeExpiredTempDocuments(db: QueryFn): Promise<RetentionReport> {
  const res = await db.query(`SELECT public.run_retention_cleanup() AS report`);
  const report = res.rows[0]?.report as
    | { deleted?: unknown; remaining?: unknown; exempt?: unknown; ran_at?: unknown }
    | null
    | undefined;
  if (!report || typeof report !== "object") {
    throw new Error("run_retention_cleanup returned no report");
  }
  return {
    deleted: Number(report.deleted ?? 0),
    remaining: Number(report.remaining ?? 0),
    exempt: Number(report.exempt ?? 0),
    ranAt: String(report.ran_at ?? ""),
  };
}
