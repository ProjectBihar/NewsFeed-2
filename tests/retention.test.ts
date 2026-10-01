// Phase 35 completion gate: "Retention works without removing metadata
// required by the archive."
//
// PGlite applies every migration, seeds one fully-populated story — every
// permanent column the plan's "Permanently Store" list names (URL,
// canonical URL, headline, publisher description, publication metadata,
// hashes/fingerprints, entities, locations, classification, story
// relationships, diagnostic scores) — plus four temporary documents (raw
// HTML / extracted body) in every retention state: expired, fresh,
// exempt, expired-body. Then it runs the scheduled cleanup and proves:
//
//   1. only expired temporary documents were deleted;
//   2. every permanent row is byte-for-byte unchanged;
//   3. the archive's reads — story window, member reports, entities,
//      classification, and the Phase 34 search RPC — still answer;
//   4. repeated runs are idempotent and exemptions persist;
//   5. the schema rejects the states the plan forbids.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { QueryFn } from "../crawler/fetch/queue-store";
import {
  RETENTION_DAYS,
  purgeExpiredTempDocuments,
  storeTempDocument,
} from "../crawler/retention/temp-store";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** The plan's permanent tables — cleanup must leave every one untouched. */
const TABLE_ORDER: Record<string, string> = {
  sources: "id",
  crawl_runs: "id",
  stories: "id",
  articles: "id",
  story_articles: "story_id, article_id",
  entities: "id",
  entity_aliases: "id",
  article_entities: "article_id, entity_id",
  classification_results: "id",
};

let db: PGlite;
let q: QueryFn;
let sourceId = 0;
let queueId = 0;
let storyId = 0;
let firstArticleId = 0;
let secondArticleId = 0;
let permanentBefore: Record<string, unknown[]> = {};

async function snapshot(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const [table, order] of Object.entries(TABLE_ORDER)) {
    const res = await db.query(`SELECT * FROM ${table} ORDER BY ${order}`);
    out[table] = res.rows as unknown[];
  }
  return out;
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

  // The Phase 3 migration seeds the registry — reuse a real source.
  const src = await db.query<{ id: number }>(`SELECT id FROM sources WHERE name = 'Dainik Jagran'`);
  sourceId = Number(src.rows[0].id);

  // Queue row: provenance link for the temp documents (fetch side).
  const queue = await db.query<{ id: number }>(
    `INSERT INTO crawl_queue (url, canonical_url, source_id, status)
     VALUES ('https://example.com/metro-1', 'https://example.com/metro-1', $1, 'fetched')
     RETURNING id`,
    [sourceId]
  );
  queueId = Number(queue.rows[0].id);

  // Story with real archive facts (first-seen order matters to /archive).
  const story = await db.query<{ id: number }>(
    `INSERT INTO stories
       (canonical_title, primary_category, event_type, district_id, first_seen_at,
        last_seen_at, article_count, source_count)
     VALUES ('Cabinet approves Patna Metro expansion', 'Infrastructure', 'approval', 'patna',
             '2026-09-28T10:00:00+05:30', '2026-09-29T09:00:00+05:30', 2, 1)
     RETURNING id`
  );
  storyId = Number(story.rows[0].id);

  // Two member articles carrying every permanent column type the plan lists.
  const first = await db.query<{ id: number }>(
    `INSERT INTO articles
       (source_id, url, canonical_url, headline, headline_hash, description, language,
        language_confidence, script_mix, published_at, content_hash, similarity_fingerprint,
        extraction_confidence, bihar_relevance_score, article_type, primary_category,
        event_type, district_id, story_id, curated)
     VALUES ($1, 'https://example.com/metro-1', 'https://example.com/metro-1',
             'Cabinet approves Patna Metro expansion', 'hh-metro-1',
             'The state cabinet approved the Patna Metro expansion.', 'en', 0.98,
             'latin:0.98', '2026-09-28T09:30:00+05:30', 'ch-metro-1', 'sf-metro-1',
             'high', 0.95, 'development', 'Infrastructure', 'approval', 'patna', $2, TRUE)
     RETURNING id`,
    [sourceId, storyId]
  );
  firstArticleId = Number(first.rows[0].id);
  const second = await db.query<{ id: number }>(
    `INSERT INTO articles
       (source_id, url, canonical_url, headline, headline_hash, description, language,
        language_confidence, script_mix, published_at, content_hash, similarity_fingerprint,
        extraction_confidence, bihar_relevance_score, article_type, primary_category,
        event_type, district_id, story_id, curated)
     VALUES ($1, 'https://example.com/metro-2', 'https://example.com/metro-2',
             'Patna Metro gets centre nod', 'hh-metro-2',
             'Centre cleared funding for the corridor.', 'hi', 0.97,
             'devanagari:0.96', '2026-09-28T08:00:00+05:30', 'ch-metro-2', 'sf-metro-2',
             'medium', 0.9, 'development', 'Infrastructure', 'approval', 'patna', $2, FALSE)
     RETURNING id`,
    [sourceId, storyId]
  );
  secondArticleId = Number(second.rows[0].id);

  // Story relationships (Phase 34 search joins these).
  await db.query(
    `INSERT INTO story_articles (story_id, article_id, cluster_score) VALUES
       ($1, $2, 0.93), ($1, $3, 0.88)`,
    [storyId, firstArticleId, secondArticleId]
  );

  // Entities + locations + aliases + links.
  const entity = await db.query<{ id: number }>(
    `INSERT INTO entities (canonical_name, entity_type, district_id, latitude, longitude)
     VALUES ('Bihar Metro Board', 'organisation', 'patna', 25.6, 85.1)
     RETURNING id`
  );
  const entityId = Number(entity.rows[0].id);
  await db.query(
    `INSERT INTO entity_aliases (entity_id, alias, language, alias_type)
     VALUES ($1, 'Metro Board', 'en', 'display')`,
    [entityId]
  );
  await db.query(
    `INSERT INTO article_entities (article_id, entity_id, confidence, evidence)
     VALUES ($1, $2, 0.91, '["headline", "body"]'::jsonb)`,
    [firstArticleId, entityId]
  );

  // Classification (append-only predictions) + a diagnostics run row.
  await db.query(
    `INSERT INTO classification_results
       (article_id, classifier_version, category, article_type, event_type, confidence, reason_codes)
     VALUES ($1, 'rules-v1', 'Infrastructure', 'development', 'approval', 0.93,
             '["title", "district"]'::jsonb)`,
    [firstArticleId]
  );
  await db.query(
    `INSERT INTO crawl_runs (status, sources_attempted, sources_succeeded)
     VALUES ('complete', 2, 2)`
  );

  // Temporary documents in every retention state the plan defines.
  // 1. expired raw HTML (fetched 11+ days ago, cleanup due)
  await db.query(
    `INSERT INTO temp_documents (url, queue_id, article_id, raw_html, expires_at)
     VALUES ($1, $2, $3, '<html><body>old metro report</body></html>', now() - interval '1 day')`,
    ["https://example.com/metro-1", queueId, firstArticleId]
  );
  // 2. fresh raw HTML (default 10-day expiry)
  await db.query(
    `INSERT INTO temp_documents (url, queue_id, article_id, raw_html)
     VALUES ($1, $2, $3, '<html><body>fresh metro report</body></html>')`,
    ["https://example.com/metro-2", queueId, secondArticleId]
  );
  // 3. exempt for manual review (no automatic expiry — plan's longer window)
  await db.query(
    `INSERT INTO temp_documents (url, body, keep_reason, expires_at)
     VALUES ('https://example.com/regression-case',
             'full extracted body held for manual review', 'manual_review', NULL)`
  );
  // 4. expired extracted body
  await db.query(
    `INSERT INTO temp_documents (url, body, expires_at)
     VALUES ('https://example.com/legacy-body', 'stale extracted body',
             now() - interval '2 days')`
  );

  permanentBefore = await snapshot();
}, 120_000);

afterAll(async () => {
  await db.close();
});

describe("Phase 35 — storage retention", () => {
  it("cleanup deletes only expired temporary documents", async () => {
    const report = await purgeExpiredTempDocuments(q);
    expect(report).toMatchObject({ deleted: 2, remaining: 2, exempt: 1 });
    expect(new Date(report.ranAt).getTime()).toBeGreaterThan(0);

    const rows = await db.query<{
      url: string;
      raw_html: string | null;
      body: string | null;
      keep_reason: string | null;
      expires_at: string | null;
    }>(
      `SELECT url, raw_html, body, keep_reason, expires_at
         FROM temp_documents ORDER BY url`
    );
    // Exactly the fresh and the exempt documents survive.
    expect(rows.rows.map((r) => r.url)).toEqual([
      "https://example.com/metro-2",
      "https://example.com/regression-case",
    ]);

    const fresh = rows.rows[0];
    expect(fresh.raw_html).toBe("<html><body>fresh metro report</body></html>");
    // Default expiry sits at RETENTION_DAYS, inside the plan's 7–14 window.
    const days = (new Date(fresh.expires_at!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeLessThanOrEqual(RETENTION_DAYS + 0.01);
    expect(days).toBeGreaterThan(RETENTION_DAYS - 0.5);
    expect(RETENTION_DAYS).toBeGreaterThanOrEqual(7);
    expect(RETENTION_DAYS).toBeLessThanOrEqual(14);

    const exempt = rows.rows[1];
    expect(exempt.keep_reason).toBe("manual_review");
    expect(exempt.expires_at).toBeNull();
    expect(exempt.body).toBe("full extracted body held for manual review");
  });

  it("every permanent row the archive needs survives byte-for-byte", async () => {
    const after = await snapshot();
    // Deep equality over every permanent table: sources, crawl_runs,
    // stories, articles, story_articles, entities, entity_aliases,
    // article_entities, classification_results — all unchanged.
    expect(after).toEqual(permanentBefore);

    // The plan's Permanently Store list, named field by field:
    const article = (after.articles as Record<string, unknown>[]).find(
      (row) => Number(row.id) === firstArticleId
    )!;
    expect({
      url: article.url,
      canonical_url: article.canonical_url,
      headline: article.headline,
      description: article.description,
      headline_hash: article.headline_hash,
      content_hash: article.content_hash,
      similarity_fingerprint: article.similarity_fingerprint,
      extraction_confidence: article.extraction_confidence,
      bihar_relevance_score: article.bihar_relevance_score,
      district_id: article.district_id,
      article_type: article.article_type,
      primary_category: article.primary_category,
      event_type: article.event_type,
      curated: article.curated,
    }).toEqual({
      url: "https://example.com/metro-1",
      canonical_url: "https://example.com/metro-1",
      headline: "Cabinet approves Patna Metro expansion",
      description: "The state cabinet approved the Patna Metro expansion.",
      headline_hash: "hh-metro-1",
      content_hash: "ch-metro-1",
      similarity_fingerprint: "sf-metro-1",
      extraction_confidence: "high",
      bihar_relevance_score: 0.95,
      district_id: "patna",
      article_type: "development",
      primary_category: "Infrastructure",
      event_type: "approval",
      curated: true,
    });
    expect(article.story_id).toBe(storyId);
    // 09:30 +05:30 is 04:00 UTC — publication metadata survived intact
    // (PGlite may hand back a Date or a string; normalise either way).
    expect(new Date(article.published_at as string | Date).toISOString()).toBe(
      "2026-09-28T04:00:00.000Z"
    );
  });

  it("archive and search reads still answer after cleanup", async () => {
    // /archive's story window (first-reported DESC, id tiebreak).
    const windowRows = await db.query<{ id: number }>(
      `SELECT id FROM stories ORDER BY first_seen_at DESC, id DESC`
    );
    expect(windowRows.rows.map((row) => Number(row.id))).toEqual([storyId]);

    // Story page facts: member reports in first-reported order.
    const members = await db.query<{ headline: string }>(
      `SELECT a.headline FROM story_articles sa
         JOIN articles a ON a.id = sa.article_id
        WHERE sa.story_id = $1
        ORDER BY a.published_at DESC`,
      [storyId]
    );
    expect(members.rows.map((row) => row.headline)).toEqual([
      "Cabinet approves Patna Metro expansion",
      "Patna Metro gets centre nod",
    ]);

    // Entities + locations + classification remain queryable.
    const entity = await db.query<{ canonical_name: string; district_id: string }>(
      `SELECT canonical_name, district_id FROM entities`
    );
    expect(entity.rows).toHaveLength(1);
    expect(entity.rows[0].canonical_name).toBe("Bihar Metro Board");
    expect(entity.rows[0].district_id).toBe("patna");
    const classification = await db.query<{ confidence: number }>(
      `SELECT confidence FROM classification_results WHERE article_id = $1`,
      [firstArticleId]
    );
    expect(Number(classification.rows[0].confidence)).toBeCloseTo(0.93);

    // The Phase 34 search RPC still finds the story after retention ran.
    const search = await db.query<{ r: { total: number; ids: number[] } }>(
      `SELECT public.search_story_ids(
              ARRAY['metro'], NULL, NULL, NULL, NULL, NULL, NULL, NULL, 20, 0) AS r`
    );
    expect(search.rows[0].r.total).toBe(1);
    expect(search.rows[0].r.ids.map(Number)).toEqual([storyId]);
  });

  it("repeated runs are idempotent and exemptions persist", async () => {
    expect(await purgeExpiredTempDocuments(q)).toMatchObject({
      deleted: 0,
      remaining: 2,
      exempt: 1,
    });
    expect(await purgeExpiredTempDocuments(q)).toMatchObject({
      deleted: 0,
      remaining: 2,
      exempt: 1,
    });
    const exempt = await db.query<{ body: string | null; keep_reason: string | null }>(
      `SELECT body, keep_reason FROM temp_documents WHERE url = 'https://example.com/regression-case'`
    );
    expect(exempt.rows[0].keep_reason).toBe("manual_review");
    expect(exempt.rows[0].body).toBe("full extracted body held for manual review");
    // And the permanent snapshot still holds after three cleanup runs.
    expect(await snapshot()).toEqual(permanentBefore);
  });

  it("the schema enforces the plan's retention rules", async () => {
    // An exemption may never carry an automatic expiry.
    await expect(
      db.query(
        `INSERT INTO temp_documents (url, raw_html, keep_reason, expires_at)
         VALUES ('https://example.com/bad-1', '<p>x</p>', 'manual_review',
                 now() + interval '90 days')`
      )
    ).rejects.toThrow(/temp_documents_lifetime_check/);
    // Automatic retention may never be claimed without an expiry either.
    await expect(
      db.query(
        `INSERT INTO temp_documents (url, raw_html, expires_at)
         VALUES ('https://example.com/bad-4', '<p>y</p>', NULL)`
      )
    ).rejects.toThrow(/temp_documents_lifetime_check/);
    // A document with no payload is storage with no purpose.
    await expect(
      db.query(`INSERT INTO temp_documents (url) VALUES ('https://example.com/bad-2')`)
    ).rejects.toThrow(/temp_documents_payload_check/);
    // The store helper refuses empty documents before touching the database.
    await expect(storeTempDocument(q, { url: "https://example.com/bad-3" })).rejects.toThrow(
      /needs rawHtml or body/
    );
  });
});
