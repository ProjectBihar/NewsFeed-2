import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  correctArticle,
  mergeStories,
  moveArticle,
  renameStory,
  splitStory,
  type Db,
} from "./mutations";

describe("atomic admin corrections and story controls", () => {
  let sql: PGlite, db: Db, article: number, story: number, target: number, source: number;
  beforeAll(async () => {
    sql = new PGlite();
    const dir = join(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await sql.exec(readFileSync(join(dir, file), "utf8"));
    source = (
      await sql.query<{ id: number }>(`INSERT INTO sources(name,domain,language,scope)
      VALUES ('Admin fixture','admin.example','en','bihar') RETURNING id`)
    ).rows[0].id;
    db = {
      rpc: async (_name: string, args: Record<string, unknown>) => {
        try {
          const result = await sql.query<{ result: unknown }>(
            "SELECT admin_mutate($1,$2,$3,$4,$5,$6,$7) AS result",
            [
              args.p_operation,
              args.p_id,
              args.p_target ?? null,
              args.p_title ?? null,
              JSON.stringify(args.p_fields ?? {}),
              args.p_article_ids ?? [],
              args.p_reason ?? null,
            ]
          );
          return { data: result.rows[0].result, error: null };
        } catch (error) {
          return { data: null, error: { message: (error as Error).message } };
        }
      },
    } as unknown as Db;
  });
  beforeEach(async () => {
    await sql.exec("DELETE FROM admin_corrections; DELETE FROM articles; DELETE FROM stories;");
    story = (
      await sql.query<{ id: number }>(
        "INSERT INTO stories(canonical_title) VALUES ('Metro story') RETURNING id"
      )
    ).rows[0].id;
    target = (
      await sql.query<{ id: number }>(
        "INSERT INTO stories(canonical_title) VALUES ('Other story') RETURNING id"
      )
    ).rows[0].id;
    const rows = (
      await sql.query<{ id: number }>(
        `INSERT INTO articles(source_id,url,canonical_url,headline,story_id,article_type,bihar_relevance_score,published_at)
      VALUES ($1,'https://admin.example/1','https://admin.example/1','Metro approval',$2,'development',0.9,'2026-10-01T00:00:00Z'),
      ($1,'https://admin.example/2','https://admin.example/2','Metro construction',$2,'development',0.9,'2026-10-02T00:00:00Z') RETURNING id`,
        [source, story]
      )
    ).rows;
    article = rows[0].id;
    await sql.exec(
      "INSERT INTO story_articles(story_id,article_id) SELECT story_id,id FROM articles;"
    );
    await sql.query<Record<string, unknown>>(
      "INSERT INTO classification_results(article_id,classifier_version) VALUES ($1,'rules-v1')",
      [article]
    );
    await sql.query<Record<string, unknown>>("SELECT recount_story_metadata($1)", [story]);
  });
  afterAll(async () => {
    await sql?.close();
  });
  it("corrects changed fields with original values and classifier version", async () => {
    expect(await correctArticle(db, article, { article_type: "governance" }, "reviewed")).toEqual({
      updatedFields: ["article_type"],
      corrections: 1,
    });
    expect(
      (
        await sql.query<Record<string, unknown>>(
          "SELECT old_value,new_value,classifier_version FROM admin_corrections"
        )
      ).rows[0]
    ).toMatchObject({
      old_value: "development",
      new_value: "governance",
      classifier_version: "rules-v1",
    });
    expect(await correctArticle(db, article, { article_type: "governance" })).toEqual({
      updatedFields: [],
      corrections: 0,
    });
  });
  it("updates entity links and excludes irrelevant reports from counts", async () => {
    await correctArticle(db, article, {
      entities: "Patna Metro, Reviewed Entity",
      bihar_relevant: "false",
    });
    expect(
      (
        await sql.query<Record<string, unknown>>(
          "SELECT count(*) AS n FROM article_entities WHERE article_id=$1",
          [article]
        )
      ).rows[0]
    ).toEqual({ n: 2 });
    expect(
      (
        await sql.query<Record<string, unknown>>("SELECT article_count FROM stories WHERE id=$1", [
          story,
        ])
      ).rows[0]
    ).toEqual({ article_count: 1 });
    await correctArticle(db, article, { entities: "" });
    expect(
      (
        await sql.query<Record<string, unknown>>(
          "SELECT count(*) AS n FROM article_entities WHERE article_id=$1",
          [article]
        )
      ).rows[0]
    ).toEqual({ n: 0 });
  });
  it("renames with audit and rejects invalid or missing targets", async () => {
    await renameStory(db, story, "  Reviewed   Metro ");
    expect(
      (
        await sql.query<Record<string, unknown>>(
          "SELECT canonical_title FROM stories WHERE id=$1",
          [story]
        )
      ).rows[0]
    ).toEqual({ canonical_title: "Reviewed Metro" });
    await expect(renameStory(db, story, " ")).rejects.toThrow();
    await expect(renameStory(db, 999999, "X")).rejects.toThrow();
  });
  it("moves both membership representations and preserves event dates", async () => {
    expect(await moveArticle(db, article, { kind: "story", id: target })).toEqual({
      storyId: target,
    });
    expect(
      (
        await sql.query<Record<string, unknown>>("SELECT story_id FROM articles WHERE id=$1", [
          article,
        ])
      ).rows[0].story_id
    ).toBe(target);
    expect(
      (
        await sql.query<Record<string, unknown>>(
          "SELECT story_id FROM story_articles WHERE article_id=$1",
          [article]
        )
      ).rows[0].story_id
    ).toBe(target);
    const moved = (
      await sql.query<{ article_count: number; first_seen_at: Date }>(
        "SELECT article_count,first_seen_at FROM stories WHERE id=$1",
        [target]
      )
    ).rows[0];
    expect(moved.article_count).toBe(1);
    expect(moved.first_seen_at.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("merges every member and parks the source story", async () => {
    expect(await mergeStories(db, story, target)).toEqual({ moved: 2 });
    expect(
      (
        await sql.query<Record<string, unknown>>(
          "SELECT status,article_count FROM stories WHERE id=$1",
          [story]
        )
      ).rows[0]
    ).toEqual({ status: "merged", article_count: 0 });
    await expect(mergeStories(db, target, target)).rejects.toThrow();
  });
  it("splits only valid subsets and preserves the new manual title", async () => {
    await expect(splitStory(db, story, [article, 999999], "Bad split")).rejects.toThrow();
    const moved = await splitStory(db, story, [article], "New angle");
    expect(
      (
        await sql.query<Record<string, unknown>>("SELECT article_count FROM stories WHERE id=$1", [
          moved.storyId,
        ])
      ).rows[0].article_count
    ).toBe(1);
    expect(
      (
        await sql.query<Record<string, unknown>>(
          "SELECT new_value FROM admin_corrections WHERE story_id=$1 AND field_name='canonical_title'",
          [moved.storyId]
        )
      ).rows[0].new_value
    ).toBe("New angle");
    const remaining = (
      await sql.query<{ id: number }>("SELECT id FROM articles WHERE story_id=$1", [story])
    ).rows[0].id;
    await expect(splitStory(db, story, [remaining], "All")).rejects.toThrow();
  });
  it("rolls back article changes when audit persistence fails", async () => {
    await sql.exec(`CREATE FUNCTION reject_fixture_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture audit failure'; END $$;
      CREATE TRIGGER reject_fixture_audit BEFORE INSERT ON admin_corrections FOR EACH ROW EXECUTE FUNCTION reject_fixture_audit();`);
    try {
      await expect(correctArticle(db, article, { article_type: "crime" })).rejects.toThrow(
        "fixture audit failure"
      );
      expect(
        (
          await sql.query<Record<string, unknown>>(
            "SELECT article_type FROM articles WHERE id=$1",
            [article]
          )
        ).rows[0].article_type
      ).toBe("development");
    } finally {
      await sql.exec(
        "DROP TRIGGER reject_fixture_audit ON admin_corrections; DROP FUNCTION reject_fixture_audit();"
      );
    }
  });
});
