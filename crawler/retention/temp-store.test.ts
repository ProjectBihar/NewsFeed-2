// Phase 35 — temporary document storage semantics.
//
// The unit-level contract the gate relies on: the 10-day window, merge
// without sliding expiry, exemption with a NULL expiry that survives
// merges, payload validation, honest purge reports, and provenance links
// that detach (never cascade) when their parent row goes.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { QueryFn } from "../fetch/queue-store";
import { RETENTION_DAYS, purgeExpiredTempDocuments, storeTempDocument } from "./temp-store";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

let db: PGlite;
let q: QueryFn;

/** Expiry distance from now, in days. */
function daysUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 86_400_000;
}

beforeAll(async () => {
  db = new PGlite();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
  q = {
    query: async (text: string, values?: unknown[]) => {
      const res = await db.query(text, values as unknown[]);
      return { rows: res.rows as Record<string, unknown>[] };
    },
  };
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("Phase 35 — temp-store", () => {
  it("stores raw HTML with the plan's 7–14 day window", async () => {
    expect(RETENTION_DAYS).toBeGreaterThanOrEqual(7);
    expect(RETENTION_DAYS).toBeLessThanOrEqual(14);

    const stored = await storeTempDocument(q, {
      url: "https://example.com/a",
      rawHtml: "<html><body>hello</body></html>",
    });
    expect(stored.id).toBeGreaterThan(0);
    expect(stored.keepReason).toBeNull();
    expect(daysUntil(stored.expiresAt!)).toBeGreaterThan(RETENTION_DAYS - 0.5);
    expect(daysUntil(stored.expiresAt!)).toBeLessThanOrEqual(RETENTION_DAYS + 0.01);
  });

  it("rejects a document with no payload", async () => {
    await expect(storeTempDocument(q, { url: "https://example.com/empty" })).rejects.toThrow(
      /needs rawHtml or body/
    );
  });

  it("merges the body into the existing document without sliding expiry", async () => {
    const first = await storeTempDocument(q, {
      url: "https://example.com/b",
      rawHtml: "<html><body>b</body></html>",
    });
    const second = await storeTempDocument(q, {
      url: "https://example.com/b",
      body: "extracted full text",
    });
    expect(second.id).toBe(first.id);
    expect(second.expiresAt).toBe(first.expiresAt); // fixed at first store

    const row = await db.query<{ raw_html: string; body: string }>(
      `SELECT raw_html, body FROM temp_documents WHERE url = 'https://example.com/b'`
    );
    expect(row.rows[0].raw_html).toBe("<html><body>b</body></html>"); // kept
    expect(row.rows[0].body).toBe("extracted full text"); // added
  });

  it("claims exemption with a NULL expiry that survives merges", async () => {
    const exempt = await storeTempDocument(q, {
      url: "https://example.com/c",
      body: "debug me",
      keepReason: "debugging",
    });
    expect(exempt.expiresAt).toBeNull();
    expect(exempt.keepReason).toBe("debugging");

    const merged = await storeTempDocument(q, {
      url: "https://example.com/c",
      rawHtml: "<html><body>c</body></html>",
    });
    expect(merged.expiresAt).toBeNull(); // exemption is never silently dropped
    expect(merged.keepReason).toBe("debugging");
  });

  it("honours a custom retention window", async () => {
    const stored = await storeTempDocument(q, {
      url: "https://example.com/d",
      rawHtml: "<html><body>d</body></html>",
      retentionDays: 7,
    });
    expect(daysUntil(stored.expiresAt!)).toBeGreaterThan(6.5);
    expect(daysUntil(stored.expiresAt!)).toBeLessThanOrEqual(7.01);
  });

  it("purges only expired rows and reports honestly", async () => {
    await storeTempDocument(q, {
      url: "https://example.com/expired",
      rawHtml: "<html><body>gone soon</body></html>",
    });
    await db.query(
      `UPDATE temp_documents SET expires_at = now() - interval '1 minute'
        WHERE url = 'https://example.com/expired'`
    );

    const report = await purgeExpiredTempDocuments(q);
    expect(report.deleted).toBe(1);
    expect(report.exempt).toBe(1); // https://example.com/c
    expect(report.remaining).toBe(4); // a, b, c, d — only the expired row went
    const urls = await db.query<{ url: string }>(`SELECT url FROM temp_documents ORDER BY url`);
    expect(urls.rows.map((r) => r.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
      "https://example.com/c",
      "https://example.com/d",
    ]);

    const again = await purgeExpiredTempDocuments(q);
    expect(again.deleted).toBe(0);
    expect(again.remaining).toBe(4); // a, b, c, d
    expect(again.exempt).toBe(1);
  });

  it("detaches provenance links instead of deleting retained documents", async () => {
    // Real source (registry seeded by the Phase 3 migration) + minimal article.
    const src = await db.query<{ id: number }>(`SELECT id FROM sources WHERE name = 'The Hindu'`);
    const article = await db.query<{ id: number }>(
      `INSERT INTO articles (source_id, url, canonical_url, headline)
       VALUES ($1, 'https://example.com/e-article', 'https://example.com/e-article',
               'Retention provenance test')
       RETURNING id`,
      [Number(src.rows[0].id)]
    );
    const articleId = Number(article.rows[0].id);
    await storeTempDocument(q, {
      url: "https://example.com/e",
      rawHtml: "<html><body>e</body></html>",
      articleId,
    });

    await db.query(`DELETE FROM articles WHERE id = $1`, [articleId]);

    // The temp document survives until ITS expiry — the FK detaches.
    const row = await db.query<{ article_id: number | null; raw_html: string }>(
      `SELECT article_id, raw_html FROM temp_documents WHERE url = 'https://example.com/e'`
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].article_id).toBeNull();
    expect(row.rows[0].raw_html).toBe("<html><body>e</body></html>");
  });
});
