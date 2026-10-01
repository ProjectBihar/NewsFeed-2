// End-to-end acquisition proof (Phase 5): Crawlee + local fixture server
// + PGlite queue. Every plan-mandated outcome travels the real path.
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { fetchBatch } from "./runner";
import { DEFAULT_FETCH_CONFIG, type FetchConfig } from "./config";
import type { QueryFn } from "./queue-store";
import { RETENTION_DAYS } from "../retention/temp-store";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const CONFIG: FetchConfig = {
  ...DEFAULT_FETCH_CONFIG,
  globalConcurrency: 10,
  perDomainConcurrency: 2,
  requestTimeoutSecs: 2,
  maxAttempts: 2,
  baseBackoffSecs: 1,
  maxBackoffSecs: 60,
};

let server: Server;
let base = "";
const hits = new Map<string, number>();
let concurrentNow = 0;
let concurrentPeak = 0;

function count(path: string): number {
  hits.set(path, (hits.get(path) ?? 0) + 1);
  return hits.get(path)!;
}

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const n = count(path);
    switch (path) {
      case "/ok":
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<html><head><title>Ok</title></head><body>article</body></html>");
        return;
      case "/redirect":
        res.writeHead(302, { location: "/ok" });
        res.end();
        return;
      case "/notfound":
        res.writeHead(404, { "content-type": "text/html" });
        res.end("nope");
        return;
      case "/gone":
        res.writeHead(410, { "content-type": "text/html" });
        res.end("gone");
        return;
      case "/forbidden":
        res.writeHead(403, { "content-type": "text/html" });
        res.end("blocked");
        return;
      case "/flaky":
        if (n === 1) {
          res.writeHead(500, { "content-type": "text/html" });
          res.end("boom");
        } else {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<html><body>recovered</body></html>");
        }
        return;
      case "/ratelimit":
        if (n === 1) {
          res.writeHead(429, { "content-type": "text/html", "retry-after": "120" });
          res.end("slow down");
        } else {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<html><body>resumed</body></html>");
        }
        return;
      case "/slow":
        setTimeout(() => {
          try {
            res.writeHead(200, { "content-type": "text/html" });
            res.end("late");
          } catch {
            /* client already timed out */
          }
        }, 5000);
        return;
      case "/image":
        res.writeHead(200, { "content-type": "image/png" });
        res.end(Buffer.from([137, 80, 78, 71]));
        return;
      case "/feed":
        res.writeHead(200, { "content-type": "application/rss+xml" });
        res.end("<rss version='2.0'></rss>");
        return;
      case "/error":
        res.writeHead(500, { "content-type": "text/html" });
        res.end("always");
        return;
      case "/concurrent":
        concurrentNow += 1;
        concurrentPeak = Math.max(concurrentPeak, concurrentNow);
        setTimeout(() => {
          concurrentNow -= 1;
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<html><body>c</body></html>");
        }, 300);
        return;
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr == null || typeof addr === "string") throw new Error("no port");
  base = `http://127.0.0.1:${addr.port}`;
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
});

function pgliteQuery(db: PGlite): QueryFn {
  return {
    query: async (text: string, values?: unknown[]) => {
      const res = await db.query(text, values as unknown[]);
      return { rows: res.rows as Record<string, unknown>[] };
    },
  };
}

describe("fetchBatch integration (Phase 5)", () => {
  it("fetches representative URLs concurrently without losing queue state", async () => {
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
        `INSERT INTO sources (name, domain, language, scope) VALUES ('F', '127.0.0.1', 'en', 'bihar')`
      );
      const src = await db.query<{ id: number }>(
        `SELECT id FROM sources WHERE domain = '127.0.0.1'`
      );
      const sid = src.rows[0].id;
      const paths = [
        "/ok",
        "/redirect",
        "/notfound",
        "/gone",
        "/forbidden",
        "/flaky",
        "/ratelimit",
        "/slow",
        "/image",
        "/feed",
        "/error",
        "/concurrent?a=1",
        "/concurrent?a=2",
        "/concurrent?a=3",
        "/concurrent?a=4",
        "/concurrent?a=5",
        "/concurrent?a=6",
      ];
      for (const p of paths) {
        await db.query(
          `INSERT INTO crawl_queue (url, canonical_url, source_id, status) VALUES ($1, $1, $2, 'queued')`,
          [`${base}${p}`, sid]
        );
      }

      const first = await fetchBatch({ db: q, config: CONFIG, batchSize: 20, quiet: true });
      expect(first.summary).toMatchObject({
        claimed: 17,
        succeeded: 8,
        retried: 4,
        failed: 2,
        blocked: 1,
        rejected: 2,
      });
      // Per-domain throttle held end to end (6 same-host rows, 300ms each).
      expect(concurrentPeak).toBeLessThanOrEqual(2);
      expect(concurrentPeak).toBeGreaterThanOrEqual(1);

      const ok = first.results.find((r) => r.url === `${base}/ok`)!;
      expect(ok.html).toContain("<title>Ok</title>");
      expect(ok.contentType).toContain("text/html");
      expect(ok.responseTimeMs).toBeGreaterThanOrEqual(0);
      const redir = first.results.find((r) => r.url === `${base}/redirect`)!;
      expect(redir.finalUrl).toBe(`${base}/ok`);
      expect(first.results.find((r) => r.url === `${base}/image`)!.html).toBeNull();

      // Phase 35: each successful response's raw HTML went to TEMPORARY
      // storage (10-day window) — nothing else did, nothing went permanent.
      expect(first.summary.tempStored).toBe(8); // ok, redirect, 6 concurrent
      expect(first.summary.tempStoreFailed).toBe(0);
      const tempRows = await db.query<{
        url: string;
        raw_html: string | null;
        keep_reason: string | null;
        expires_at: string;
      }>(`SELECT url, raw_html, keep_reason, expires_at FROM temp_documents`);
      expect(tempRows.rows).toHaveLength(8);
      const okTemp = tempRows.rows.find((r) => r.url === `${base}/ok`)!;
      expect(okTemp.raw_html).toContain("<title>Ok</title>");
      expect(okTemp.keep_reason).toBeNull();
      const expiryDays = (new Date(okTemp.expires_at).getTime() - Date.now()) / 86_400_000;
      expect(expiryDays).toBeLessThanOrEqual(RETENTION_DAYS + 0.01);
      expect(expiryDays).toBeGreaterThan(RETENTION_DAYS - 1);
      // The queue link is provenance for the temp document.
      const linked = await db.query<{ queue_id: number | null }>(
        `SELECT queue_id FROM temp_documents WHERE url = $1`,
        [`${base}/ok`]
      );
      expect(Number(linked.rows[0].queue_id)).toBeGreaterThan(0);

      // Retry-After honoured: ~120s out, not the 1s base backoff.
      const rl = await db.query<{ next_retry_at: string }>(
        `SELECT next_retry_at FROM crawl_queue WHERE canonical_url = $1`,
        [`${base}/ratelimit`]
      );
      const waitSecs = (new Date(rl.rows[0].next_retry_at as string).getTime() - Date.now()) / 1000;
      expect(waitSecs).toBeGreaterThan(100);
      expect(waitSecs).toBeLessThanOrEqual(125);

      // Second pass: flaky + ratelimit recover, slow/error exhaust the cap.
      await db.query(
        `UPDATE crawl_queue SET next_retry_at = now() - make_interval(secs => 1) WHERE status = 'retry'`
      );
      const due = await db.query<{ canonical_url: string; status: string }>(
        `SELECT canonical_url, status FROM crawl_queue WHERE status = 'retry'`
      );
      expect(due.rows).toHaveLength(4);
      const second = await fetchBatch({ db: q, config: CONFIG, batchSize: 20, quiet: true });
      expect(second.summary).toMatchObject({
        claimed: 4,
        succeeded: 2,
        failed: 2,
        retried: 0,
      });
      const states = await db.query<{ canonical_url: string; status: string }>(
        `SELECT canonical_url, status FROM crawl_queue WHERE source_id = $1 ORDER BY canonical_url`,
        [sid]
      );
      const byUrl = new Map(states.rows.map((r) => [r.canonical_url, r.status]));
      expect(byUrl.get(`${base}/flaky`)).toBe("fetched");
      expect(byUrl.get(`${base}/ratelimit`)).toBe("fetched");
      expect(byUrl.get(`${base}/slow`)).toBe("failed");
      expect(byUrl.get(`${base}/error`)).toBe("failed");
      expect(byUrl.get(`${base}/forbidden`)).toBe("blocked");
      expect(byUrl.get(`${base}/notfound`)).toBe("failed");
      // No row stranded mid-flight.
      expect([...byUrl.values()]).not.toContain("fetching");

      // Phase 35: second pass stored only the two successes (10 total);
      // failed/blocked/rejected URLs never keep HTML in storage.
      expect(second.summary.tempStored).toBe(2);
      expect(second.summary.tempStoreFailed).toBe(0);
      const allTemp = await db.query<{ url: string }>(`SELECT url FROM temp_documents`);
      expect(allTemp.rows).toHaveLength(10);
      const tempUrls = new Set(allTemp.rows.map((r) => r.url));
      expect(tempUrls.has(`${base}/flaky`)).toBe(true);
      expect(tempUrls.has(`${base}/ratelimit`)).toBe(true);
      expect(tempUrls.has(`${base}/notfound`)).toBe(false);
      expect(tempUrls.has(`${base}/error`)).toBe(false);
      expect(tempUrls.has(`${base}/image`)).toBe(false);
      expect(tempUrls.has(`${base}/feed`)).toBe(false);
    } finally {
      await db.close();
    }
  }, 120000);
});
