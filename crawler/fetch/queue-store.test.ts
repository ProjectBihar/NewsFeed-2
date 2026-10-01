import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  claimDueRows,
  computeBackoffSecs,
  recordFetchResult,
  releaseStaleClaims,
  type QueryFn,
} from "./queue-store";
import { DEFAULT_FETCH_CONFIG } from "./config";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function pgliteQuery(db: PGlite): QueryFn {
  return {
    query: async (text, values) => {
      const res = await db.query(text, values as unknown[]);
      return { rows: res.rows as Record<string, unknown>[] };
    },
  };
}

describe("queue-store persistence (Phase 5, PGlite)", () => {
  it("claims atomically, records outcomes, and recovers stale rows", async () => {
    const db = new PGlite();
    try {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const f of files) {
        await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
      }
      const q = pgliteQuery(db);
      await db.query(
        `INSERT INTO sources (name, domain, language, scope) VALUES ('S', 's.example', 'en', 'bihar')`
      );
      const src = await db.query<{ id: number }>(
        `SELECT id FROM sources WHERE domain = 's.example'`
      );
      const sid = src.rows[0].id;
      await db.query(
        `INSERT INTO crawl_queue (url, canonical_url, source_id, status, priority) VALUES
         ('https://s.example/1', 'https://s.example/1', $1, 'queued', 'high'),
         ('https://s.example/2', 'https://s.example/2', $1, 'queued', 'low')`,
        [sid]
      );

      const claimed = await claimDueRows(q, 10);
      expect(claimed).toHaveLength(2);
      expect(claimed[0].canonical_url).toBe("https://s.example/1"); // high first
      expect(claimed.every((c) => c.attempts === 1)).toBe(true);
      expect(await claimDueRows(q, 10)).toHaveLength(0); // nothing double-claimed

      await recordFetchResult(
        q,
        claimed[0].id,
        claimed[0].attempts,
        {
          decision: "success",
          reason: "http-200",
        },
        DEFAULT_FETCH_CONFIG
      );
      await recordFetchResult(
        q,
        claimed[1].id,
        claimed[1].attempts,
        {
          decision: "retry",
          reason: "http-503-server-error",
        },
        DEFAULT_FETCH_CONFIG
      );

      const states = await db.query<{ canonical_url: string; status: string }>(
        `SELECT canonical_url, status FROM crawl_queue WHERE source_id = $1 ORDER BY canonical_url`,
        [sid]
      );
      expect(states.rows).toEqual([
        { canonical_url: "https://s.example/1", status: "fetched" },
        { canonical_url: "https://s.example/2", status: "retry" },
      ]);

      // Simulate a crashed worker: row stuck in fetching, then recovered.
      await db.query(
        `UPDATE crawl_queue SET status = 'fetching', last_attempt_at = now() - make_interval(secs => 3600) WHERE canonical_url = 'https://s.example/1'`
      );
      expect(await releaseStaleClaims(q, 60)).toBe(1);
      const after = await db.query<{ status: string }>(
        `SELECT status FROM crawl_queue WHERE canonical_url = 'https://s.example/1'`
      );
      expect(after.rows[0].status).toBe("retry");
    } finally {
      await db.close();
    }
  });

  it("fails terminally at the attempt cap and parks 403 separately", async () => {
    const db = new PGlite();
    try {
      const files = readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort();
      for (const f of files) {
        await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
      }
      const q = pgliteQuery(db);
      await db.query(
        `INSERT INTO sources (name, domain, language, scope) VALUES ('T', 't.example', 'en', 'bihar')`
      );
      const src = await db.query<{ id: number }>(
        `SELECT id FROM sources WHERE domain = 't.example'`
      );
      const sid = src.rows[0].id;
      const mk = async (url: string) => {
        await db.query(
          `INSERT INTO crawl_queue (url, canonical_url, source_id, status) VALUES ($1, $1, $2, 'queued')`,
          [url, sid]
        );
        const r = await db.query<{ id: number }>(
          `SELECT id FROM crawl_queue WHERE canonical_url = $1`,
          [url]
        );
        return r.rows[0].id;
      };
      const exhausted = await mk("https://t.example/old");
      await recordFetchResult(
        q,
        exhausted,
        5,
        { decision: "retry", reason: "http-500" },
        DEFAULT_FETCH_CONFIG
      );
      const blocked = await mk("https://t.example/nope");
      await recordFetchResult(
        q,
        blocked,
        1,
        { decision: "blocked", reason: "http-403-blocked" },
        DEFAULT_FETCH_CONFIG
      );
      const gone = await mk("https://t.example/gone");
      await recordFetchResult(
        q,
        gone,
        1,
        { decision: "permanent", reason: "http-404-gone" },
        DEFAULT_FETCH_CONFIG
      );
      const img = await mk("https://t.example/logo.png");
      await recordFetchResult(
        q,
        img,
        1,
        { decision: "reject-content", reason: "content-image/png" },
        DEFAULT_FETCH_CONFIG
      );

      const states = await db.query<{ canonical_url: string; status: string; last_error: string }>(
        `SELECT canonical_url, status, last_error FROM crawl_queue WHERE source_id = $1 ORDER BY canonical_url`,
        [sid]
      );
      expect(states.rows).toEqual([
        { canonical_url: "https://t.example/gone", status: "failed", last_error: "http-404-gone" },
        {
          canonical_url: "https://t.example/logo.png",
          status: "rejected",
          last_error: "content-image/png",
        },
        {
          canonical_url: "https://t.example/nope",
          status: "blocked",
          last_error: "http-403-blocked",
        },
        {
          canonical_url: "https://t.example/old",
          status: "failed",
          last_error: "attempts-exhausted: http-500",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("backs off exponentially with a ceiling, but honours Retry-After exactly", () => {
    const cfg = { baseBackoffSecs: 60, maxBackoffSecs: 3600 };
    expect(computeBackoffSecs(1, cfg)).toBe(60);
    expect(computeBackoffSecs(3, cfg)).toBe(240);
    expect(computeBackoffSecs(20, cfg)).toBe(3600);
    expect(computeBackoffSecs(1, cfg, 120)).toBe(120);
    // A server directive outranks our ceiling.
    expect(computeBackoffSecs(1, { baseBackoffSecs: 1, maxBackoffSecs: 60 }, 120)).toBe(120);
  });
});
