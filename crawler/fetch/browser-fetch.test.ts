// Browser fallback proof (Phase 6): PlaywrightCrawler renders a JS-only
// page the HTTP engine could never extract, while HTTP-only rows wait.
import { createServer, type Server } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { fetchBrowserBatch } from "./runner";
import { loadBrowserConfig } from "./config";
import type { QueryFn } from "./queue-store";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    if (path === "/js-page") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(
        `<html><head><title>Shell</title></head><body>` +
          `<div id="app">loading</div>` +
          `<script>document.getElementById("app").textContent = ["rendered", "by", "js"].join("-");</script>` +
          `</body></html>`
      );
      return;
    }
    if (path === "/plain") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>plain article</body></html>");
      return;
    }
    if (path === "/denied") {
      res.writeHead(403, { "content-type": "text/html" });
      res.end("Access Denied");
      return;
    }
    res.writeHead(404);
    res.end();
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

describe("fetchBrowserBatch (Phase 6, Chromium)", () => {
  it("renders JS, parks 403s, and leaves HTTP-only sources alone", async () => {
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
        `INSERT INTO sources (name, domain, language, scope, requires_browser) VALUES
         ('JS Source', '127.0.0.1', 'en', 'bihar', TRUE),
         ('HTTP Source', 'http-only.example', 'en', 'bihar', FALSE)`
      );
      const ids = await db.query<{ id: number; domain: string }>(
        `SELECT id, domain FROM sources WHERE domain IN ('127.0.0.1', 'http-only.example')`
      );
      const byDomain = new Map(ids.rows.map((r) => [r.domain as string, r.id as number]));
      for (const p of ["/js-page", "/plain", "/denied"]) {
        await db.query(
          `INSERT INTO crawl_queue (url, canonical_url, source_id, status) VALUES ($1, $1, $2, 'queued')`,
          [`${base}${p}`, byDomain.get("127.0.0.1")]
        );
      }
      await db.query(
        `INSERT INTO crawl_queue (url, canonical_url, source_id, status) VALUES
         ('https://http-only.example/x', 'https://http-only.example/x', $1, 'queued')`,
        [byDomain.get("http-only.example")]
      );

      const config = loadBrowserConfig({ BROWSER_TIMEOUT_SECS: "20" });
      const { summary, results } = await fetchBrowserBatch({
        db: q,
        config,
        batchSize: 10,
        quiet: true,
      });

      expect(summary).toMatchObject({ claimed: 3, succeeded: 2, blocked: 1 });

      // The JS-computed text exists only post-execution: raw HTTP could
      // never produce `>rendered-by-js<`.
      const js = results.find((r) => r.url === `${base}/js-page`)!;
      expect(js.html).toContain(">rendered-by-js<");

      const states = await db.query<{ canonical_url: string; status: string }>(
        `SELECT canonical_url, status FROM crawl_queue ORDER BY canonical_url`
      );
      const byUrl = new Map(
        states.rows.map((r) => [r.canonical_url as string, r.status as string])
      );
      expect(byUrl.get(`${base}/js-page`)).toBe("fetched");
      expect(byUrl.get(`${base}/plain`)).toBe("fetched");
      expect(byUrl.get(`${base}/denied`)).toBe("blocked");
      expect(byUrl.get("https://http-only.example/x")).toBe("queued");
    } finally {
      await db.close();
    }
  }, 120000);
});
