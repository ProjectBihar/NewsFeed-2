import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const EXPECTED_TABLES = [
  "sources",
  "source_endpoints",
  "crawl_runs",
  "crawl_queue",
  "articles",
  "stories",
  "story_articles",
  "entities",
  "entity_aliases",
  "article_entities",
  "source_health",
  "classification_results",
  "admin_corrections",
];

function migrationFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  expect(files.length).toBeGreaterThan(0);
  return files.map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
}

describe("Phase 2 database foundation", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    for (const sql of migrationFiles()) {
      await db.exec(sql);
    }
  });

  it("creates all canonical tables", async () => {
    const res = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    const names = res.rows.map((r) => r.table_name);
    for (const t of EXPECTED_TABLES) {
      expect(names).toContain(t);
    }
  });

  it("declares explicit foreign keys", async () => {
    const res = await db.query<{ count: string }>(
      `SELECT count(*) FROM information_schema.table_constraints
       WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY'`
    );
    // articles(2) + endpoints + queue + story_articles(2) + entities self-ref +
    // aliases + article_entities(2) + health + classification + corrections(2) = 13
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(13);
  });

  it("runs an end-to-end insert flow with feed query", async () => {
    const src = await db.query<{ id: number }>(
      `INSERT INTO sources (name, domain, language, scope, source_type, priority)
       VALUES ('Test Source', 'test-source.example', 'en', 'bihar', 'news', 'high')
       RETURNING id`
    );
    const sourceId = src.rows[0].id;

    await db.query(
      `INSERT INTO source_endpoints (source_id, endpoint_type, url)
       VALUES ($1, 'rss', 'https://test-source.example/feed')`,
      [sourceId]
    );
    await db.query(
      `INSERT INTO crawl_queue (url, canonical_url, source_id, discovery_method, status)
       VALUES ('https://test-source.example/a?utm_source=x', 'https://test-source.example/a', $1, 'rss', 'queued')`,
      [sourceId]
    );
    const story = await db.query<{ id: number }>(
      `INSERT INTO stories (canonical_title, primary_category, event_type, district_id)
       VALUES ('Bihar Cabinet approves test project', 'Infrastructure', 'approval', 'patna')
       RETURNING id`
    );
    const storyId = story.rows[0].id;

    const article = await db.query<{ id: number }>(
      `INSERT INTO articles (source_id, url, canonical_url, headline, headline_hash,
         description, language, published_at, content_hash, extraction_confidence,
         bihar_relevance_score, article_type, primary_category, event_type,
         district_id, story_id, curated)
       VALUES ($1, 'https://test-source.example/a', 'https://test-source.example/a',
         'Bihar Cabinet approves test project', 'hash1', 'desc', 'en',
         now(), 'content1', 'high', 0.91, 'governance', 'Infrastructure',
         'approval', 'patna', $2, TRUE)
       RETURNING id`,
      [sourceId, storyId]
    );
    const articleId = article.rows[0].id;

    await db.query(
      `INSERT INTO story_articles (story_id, article_id, cluster_score)
       VALUES ($1, $2, 0.95)`,
      [storyId, articleId]
    );
    const entity = await db.query<{ id: number }>(
      `INSERT INTO entities (canonical_name, entity_type, district_id)
       VALUES ('Test Project', 'major_project', 'patna') RETURNING id`
    );
    const entityId = entity.rows[0].id;
    await db.query(
      `INSERT INTO entity_aliases (entity_id, alias, language, alias_type)
       VALUES ($1, 'Test Proj', 'en', 'abbreviation')`,
      [entityId]
    );
    await db.query(
      `INSERT INTO article_entities (article_id, entity_id, confidence, evidence)
       VALUES ($1, $2, 0.9, '["headline match"]')`,
      [articleId, entityId]
    );
    await db.query(
      `INSERT INTO classification_results (article_id, classifier_version, category, article_type, confidence, reason_codes)
       VALUES ($1, 'rules-v0', 'Infrastructure', 'governance', 0.87, '["cabinet+patna"]')`,
      [articleId]
    );
    await db.query(
      `INSERT INTO admin_corrections (article_id, field_name, old_value, new_value)
       VALUES ($1, 'primary_category', 'Governance', 'Infrastructure')`,
      [articleId]
    );
    await db.query(
      `INSERT INTO source_health (source_id, health_state, articles_discovered)
       VALUES ($1, 'HEALTHY', 10)`,
      [sourceId]
    );
    await db.query(`INSERT INTO crawl_runs (status, sources_attempted) VALUES ('complete', 1)`);

    const feed = await db.query<{ headline: string }>(
      `SELECT headline FROM articles
       WHERE curated = TRUE ORDER BY published_at DESC NULLS LAST LIMIT 10`
    );
    expect(feed.rows.map((r) => r.headline)).toContain("Bihar Cabinet approves test project");
  });

  it("enforces controlled vocabularies and ranges", async () => {
    await expect(
      db.query(
        `INSERT INTO sources (name, domain, language, scope, source_type)
         VALUES ('Bad', 'bad.example', 'en', 'bihar', 'blog')`
      )
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO crawl_queue (url, canonical_url, status)
         VALUES ('https://x.example/', 'https://x.example/', 'teleported')`
      )
    ).rejects.toThrow();
    await expect(
      db.query(`INSERT INTO source_health (source_id, health_state) VALUES (1, 'FINE')`)
    ).rejects.toThrow();
  });

  it("enforces uniqueness and single-story membership", async () => {
    const src = await db.query<{ id: number }>(
      `INSERT INTO sources (name, domain, language, scope)
       VALUES ('Dup Source', 'dup-source.example', 'en', 'bihar') RETURNING id`
    );
    const sourceId = src.rows[0].id;
    await db.query(
      `INSERT INTO articles (source_id, url, canonical_url, headline)
       VALUES ($1, 'https://dup-source.example/1', 'https://dup-source.example/1', 'One')`,
      [sourceId]
    );
    await expect(
      db.query(
        `INSERT INTO articles (source_id, url, canonical_url, headline)
         VALUES ($1, 'https://dup-source.example/1?amp=1', 'https://dup-source.example/1', 'One AMP')`,
        [sourceId]
      )
    ).rejects.toThrow();

    const s1 = await db.query<{ id: number }>(
      `INSERT INTO stories (canonical_title) VALUES ('Story A') RETURNING id`
    );
    const s2 = await db.query<{ id: number }>(
      `INSERT INTO stories (canonical_title) VALUES ('Story B') RETURNING id`
    );
    const art = await db.query<{ id: number }>(
      `INSERT INTO articles (source_id, url, canonical_url, headline)
       VALUES ($1, 'https://dup-source.example/2', 'https://dup-source.example/2', 'Two')
       RETURNING id`,
      [sourceId]
    );
    await db.query(`INSERT INTO story_articles (story_id, article_id) VALUES ($1, $2)`, [
      s1.rows[0].id,
      art.rows[0].id,
    ]);
    await expect(
      db.query(`INSERT INTO story_articles (story_id, article_id) VALUES ($1, $2)`, [
        s2.rows[0].id,
        art.rows[0].id,
      ])
    ).rejects.toThrow();

    await expect(
      db.query(
        `INSERT INTO admin_corrections (field_name, new_value)
         VALUES ('primary_category', 'Infrastructure')`
      )
    ).rejects.toThrow();
  });

  it("installs updated_at triggers", async () => {
    const res = await db.query<{ trigger_name: string }>(
      `SELECT trigger_name FROM information_schema.triggers
       WHERE trigger_schema = 'public'`
    );
    expect(res.rows.length).toBeGreaterThanOrEqual(6);
  });
});
