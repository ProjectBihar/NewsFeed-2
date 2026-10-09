import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

describe("database reader and service-role boundaries", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(
      "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;"
    );
    const dir = join(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    }
    await db.exec(`
      INSERT INTO sources(name, domain, language, scope, active)
      VALUES ('Access fixture', 'access.example', 'en', 'bihar', true);
      INSERT INTO stories(canonical_title, status)
      VALUES ('Public metro approval', 'active'), ('Unrelated news', 'active'),
             ('Peripheral story', 'active'), ('Merged metro story', 'merged');
      INSERT INTO articles(source_id, url, canonical_url, headline, bihar_relevance_score, article_type, story_id, curated)
      SELECT src.id, 'https://access.example/' || s.id, 'https://access.example/' || s.id,
             s.canonical_title, CASE WHEN s.canonical_title = 'Unrelated news' THEN 0.1 ELSE 0.9 END,
             CASE WHEN s.canonical_title = 'Peripheral story' THEN 'advertorial' ELSE 'development' END,
             s.id, true
      FROM sources src CROSS JOIN stories s WHERE src.domain = 'access.example';
      INSERT INTO story_articles(story_id, article_id) SELECT story_id, id FROM articles;
      INSERT INTO entities(canonical_name, entity_type) VALUES ('Patna Metro', 'major_project'), ('Private entity', 'agency');
      INSERT INTO article_entities(article_id, entity_id)
      SELECT a.id, e.id FROM articles a CROSS JOIN entities e
      WHERE a.headline = 'Public metro approval' AND e.canonical_name = 'Patna Metro';
    `);
  });
  afterAll(async () => {
    await db?.close();
  });

  async function asRole<T>(role: string, operation: () => Promise<T>): Promise<T> {
    await db.exec(`SET ROLE ${role}`);
    try {
      return await operation();
    } finally {
      await db.exec("RESET ROLE");
    }
  }

  it("allows public metadata, embeds and search while hiding ineligible stories", async () => {
    for (const role of ["anon", "authenticated"]) {
      await asRole(role, async () => {
        const stories = await db.query("SELECT canonical_title FROM stories");
        expect(stories.rows).toEqual([{ canonical_title: "Public metro approval" }]);
        const reports = await db.query(`SELECT a.headline, src.name FROM stories s
          JOIN story_articles sa ON sa.story_id = s.id JOIN articles a ON a.id = sa.article_id
          JOIN sources src ON src.id = a.source_id`);
        expect(reports.rows).toHaveLength(1);
        const entities = await db.query("SELECT canonical_name FROM entities");
        expect(entities.rows).toEqual([{ canonical_name: "Patna Metro" }]);
        const search = await db.query<{ result: { total: number; ids: number[] } }>(
          "SELECT search_story_ids(p_tokens => ARRAY['metro']) AS result"
        );
        expect(search.rows[0].result.total).toBe(1);
        expect(search.rows[0].result.ids).toHaveLength(1);
      });
    }
  });

  it("denies direct writes, private tables, diagnostic columns and cleanup RPC", async () => {
    for (const role of ["anon", "authenticated"]) {
      await asRole(role, async () => {
        for (const sql of [
          "UPDATE stories SET canonical_title = 'tampered'",
          "INSERT INTO stories(canonical_title) VALUES ('tampered')",
          "DELETE FROM articles",
          "SELECT * FROM temp_documents",
          "SELECT * FROM source_endpoints",
          "SELECT * FROM crawl_queue",
          "SELECT * FROM source_health",
          "SELECT * FROM admin_corrections",
          "SELECT requires_browser FROM sources",
          "SELECT content_hash FROM articles",
          "SELECT run_retention_cleanup()",
          "SELECT admin_mutate('rename', 1, p_title => 'tampered')",
          "SELECT recount_story_metadata(1)",
        ]) {
          await expect(db.query(sql), sql).rejects.toThrow(/permission denied/i);
        }
      });
    }
  });

  it("lets the service role read diagnostics and write behind the server boundary", async () => {
    await asRole("service_role", async () => {
      expect((await db.query("SELECT * FROM stories")).rows).toHaveLength(4);
      await db.query("UPDATE stories SET source_count = 1");
      expect((await db.query("SELECT * FROM source_endpoints")).rows.length).toBeGreaterThan(0);
      expect((await db.query("SELECT run_retention_cleanup()")).rows).toHaveLength(1);
    });
  });
});
