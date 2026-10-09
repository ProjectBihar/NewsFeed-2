import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

type Timeline = {
  total: number;
  page: number;
  totalPages: number;
  asOf: string;
  stories: Array<{
    id: number;
    canonical_title: string;
    date_verified: boolean;
    article_count: number;
  }>;
};

describe("public timeline with actual PostgreSQL and anonymous RLS", () => {
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
  });
  beforeEach(async () => {
    await db.exec(`BEGIN;
      INSERT INTO sources(name,domain,language,scope) VALUES ('Timeline fixture','timeline.example','en','bihar');
      INSERT INTO stories(canonical_title) SELECT 'Report '||n FROM generate_series(1,181) n;
      INSERT INTO articles(source_id,url,canonical_url,headline,story_id,article_type,bihar_relevance_score,
        published_at,created_at,first_seen_at)
      SELECT src.id,'https://timeline.example/'||s.id,'https://timeline.example/'||s.id,s.canonical_title,s.id,
        'sports',0.9,now()-interval '1 hour',now()-interval '2 hours',now()-interval '2 hours'
      FROM stories s CROSS JOIN sources src WHERE src.domain='timeline.example';
      INSERT INTO story_articles(story_id,article_id,created_at)
        SELECT story_id,id,now()-interval '2 hours' FROM articles WHERE source_id=(SELECT id FROM sources WHERE domain='timeline.example');
    `);
  });
  afterEach(async () => {
    await db.exec("RESET ROLE; ROLLBACK;");
  });
  afterAll(async () => {
    await db?.close();
  });

  async function timeline(page = 1, asOf: string | null = null): Promise<Timeline> {
    await db.exec("SET ROLE anon");
    try {
      return (
        await db.query<{ result: Timeline }>("SELECT public_timeline($1,$2) AS result", [
          page,
          asOf,
        ])
      ).rows[0].result;
    } finally {
      await db.exec("RESET ROLE");
    }
  }

  it("returns all eligible sports reports in 90-card pages with no overlaps and clamps oversized pages", async () => {
    const one = await timeline();
    const two = await timeline(2, one.asOf);
    const three = await timeline(999, one.asOf);
    expect(one.total).toBe(181);
    expect(one.totalPages).toBe(3);
    expect(one.stories).toHaveLength(90);
    expect(two.stories).toHaveLength(90);
    expect(three.page).toBe(3);
    expect(three.stories).toHaveLength(1);
    expect(new Set([...one.stories, ...two.stories, ...three.stories].map((s) => s.id)).size).toBe(
      181
    );
  });

  async function report(name: string, published: string, extra = "") {
    await db.exec(`INSERT INTO stories(canonical_title) VALUES ('${name}');
      INSERT INTO articles(source_id,url,canonical_url,headline,story_id,article_type,bihar_relevance_score,
        published_at,first_seen_at,created_at)
      SELECT src.id,'https://timeline.example/${name}','https://timeline.example/${name}','${name}',s.id,
        'entertainment',0.9,${published},now()-interval '1 minute',now()-interval '1 minute'
      FROM sources src CROSS JOIN stories s WHERE src.domain='timeline.example' AND s.canonical_title='${name}';
      INSERT INTO story_articles(story_id,article_id,created_at)
        SELECT story_id,id,now()-interval '1 minute' FROM articles WHERE headline='${name}'; ${extra}`);
  }

  it("includes day seven, excludes day eight, future reports and new crawls of old reports; marks missing dates", async () => {
    const cutoff =
      "(date_trunc('day',now() AT TIME ZONE 'Asia/Kolkata')-interval '6 days') AT TIME ZONE 'Asia/Kolkata'";
    await report("boundary", cutoff);
    await report("expired", `(${cutoff})-interval '1 second'`);
    await report("old-recently-found", "now()-interval '20 days'");
    await report("future", "now()+interval '1 day'");
    await report("undated", "NULL");
    await report(
      "ad",
      "now()-interval '1 minute'",
      "UPDATE articles SET article_type='advertorial' WHERE headline='ad';"
    );
    await report(
      "irrelevant",
      "now()-interval '1 minute'",
      "UPDATE articles SET bihar_relevance_score=0.1 WHERE headline='irrelevant';"
    );
    await report(
      "merged",
      "now()-interval '1 minute'",
      "UPDATE stories SET status='merged' WHERE canonical_title='merged';"
    );
    const result = await timeline();
    expect(result.total).toBe(183);
    expect(result.stories.find((s) => s.canonical_title === "undated")?.date_verified).toBe(false);
    const all = [
      ...result.stories,
      ...(await timeline(2, result.asOf)).stories,
      ...(await timeline(3, result.asOf)).stories,
    ];
    expect(all.some((s) => s.canonical_title === "boundary")).toBe(true);
    for (const excluded of [
      "expired",
      "old-recently-found",
      "future",
      "ad",
      "irrelevant",
      "merged",
    ]) {
      expect(all.some((s) => s.canonical_title === excluded)).toBe(false);
    }
    expect(
      (await db.query("SELECT id FROM stories WHERE canonical_title='expired'")).rows
    ).toHaveLength(1);
  });

  it("does not shift pages when a late arrival or a newer member report is inserted after the snapshot", async () => {
    const first = await timeline();
    await report(
      "late",
      "now()-interval '1 minute'",
      "UPDATE articles SET created_at=now()+interval '1 second' WHERE headline='late';"
    );
    await db.exec(`INSERT INTO articles(source_id,url,canonical_url,headline,story_id,article_type,bihar_relevance_score,published_at,created_at)
      SELECT source_id,'https://timeline.example/update','https://timeline.example/update','Updated report',story_id,'miscellaneous',0.9,
        now()-interval '1 minute',now()+interval '1 second' FROM articles WHERE headline='Report 1';
      INSERT INTO story_articles(story_id,article_id,created_at) SELECT story_id,id,now()+interval '1 second' FROM articles WHERE headline='Updated report';`);
    const repeated = await timeline(1, first.asOf);
    expect(repeated.total).toBe(181);
    expect(repeated.stories.map((s) => s.id)).toEqual(first.stories.map((s) => s.id));
  });
});
