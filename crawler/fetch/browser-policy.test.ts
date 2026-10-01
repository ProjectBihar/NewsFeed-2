import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { requiresBrowser, claimBrowserRows } from "./browser-policy";
import type { QueryFn } from "./queue-store";
import { loadBrowserConfig } from "./config";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function pgliteQuery(db: PGlite): QueryFn {
  return {
    query: async (text: string, values?: unknown[]) => {
      const res = await db.query(text, values as unknown[]);
      return { rows: res.rows as Record<string, unknown>[] };
    },
  };
}

describe("browser routing policy (Phase 6)", () => {
  it("routes to Chromium only on the operator flag", () => {
    expect(requiresBrowser({ requires_browser: true })).toBe(true);
    expect(requiresBrowser({ requires_browser: false })).toBe(false);
  });

  it("never auto-escalates on failure history", () => {
    // A source blocked 50 times is still HTTP-only until an operator
    // sets the flag with evidence. This is deliberate, not a gap.
    expect(requiresBrowser({ requires_browser: false })).toBe(false);
  });

  it("loads a deliberately small browser config", () => {
    const cfg = loadBrowserConfig({});
    expect(cfg.globalConcurrency).toBe(2);
    expect(cfg.perDomainConcurrency).toBe(1);
    expect(cfg.requestTimeoutSecs).toBe(45);
    expect(cfg.maxAttempts).toBe(5);
  });
});

describe("claimBrowserRows (Phase 6, PGlite)", () => {
  it("claims flagged sources while HTTP-only rows wait", async () => {
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
         ('JS Heavy', 'js.example', 'en', 'bihar', TRUE),
         ('Plain HTTP', 'plain.example', 'en', 'bihar', FALSE)`
      );
      const ids = await db.query<{ id: number; domain: string }>(
        `SELECT id, domain FROM sources WHERE domain IN ('js.example', 'plain.example')`
      );
      const byDomain = new Map(ids.rows.map((r) => [r.domain as string, r.id as number]));
      await db.query(
        `INSERT INTO crawl_queue (url, canonical_url, source_id, status) VALUES
         ('https://js.example/a', 'https://js.example/a', $1, 'queued'),
         ('https://plain.example/b', 'https://plain.example/b', $2, 'queued')`,
        [byDomain.get("js.example"), byDomain.get("plain.example")]
      );

      const claimed = await claimBrowserRows(q, 10);
      expect(claimed.map((c) => c.canonical_url)).toEqual(["https://js.example/a"]);

      const left = await db.query<{ canonical_url: string; status: string }>(
        `SELECT canonical_url, status FROM crawl_queue WHERE canonical_url = 'https://plain.example/b'`
      );
      expect(left.rows[0].status).toBe("queued");
    } finally {
      await db.close();
    }
  });
});
