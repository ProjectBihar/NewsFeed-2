import { beforeEach, describe, expect, it } from "vitest";
import {
  correctArticle,
  currentEntityNames,
  mergeStories,
  moveArticle,
  renameStory,
  splitStory,
} from "./mutations";
import { fakeDb, type FakeDb } from "./fake-db";

function seed(): FakeDb {
  return fakeDb({
    articles: [
      {
        id: 1,
        story_id: 10,
        source_id: 7,
        url: "https://x.example/1",
        headline: "Metro approved",
        article_type: "development",
        primary_category: "Infrastructure",
        event_type: "approval",
        district_id: "patna",
        bihar_relevance_score: 0.9,
      },
      {
        id: 2,
        story_id: 10,
        source_id: 8,
        url: "https://x.example/2",
        headline: "Metro cleared",
        article_type: "development",
        primary_category: "Infrastructure",
        event_type: "approval",
        district_id: "patna",
        bihar_relevance_score: 0.8,
      },
      {
        id: 3,
        story_id: 20,
        source_id: 7,
        url: "https://x.example/3",
        headline: "Robbery reported",
        article_type: "crime",
        primary_category: "Governance",
        event_type: "crime",
        district_id: "patna",
        bihar_relevance_score: 0.7,
      },
    ],
    stories: [
      {
        id: 10,
        canonical_title: "Metro story",
        status: "active",
        article_count: 2,
        source_count: 2,
      },
      {
        id: 20,
        canonical_title: "Crime story",
        status: "active",
        article_count: 1,
        source_count: 1,
      },
    ],
    story_articles: [
      { story_id: 10, article_id: 1, cluster_score: 0.9 },
      { story_id: 10, article_id: 2, cluster_score: 0.8 },
      { story_id: 20, article_id: 3, cluster_score: null },
    ],
    classification_results: [
      { id: 100, article_id: 1, classifier_version: "rules-v1", confidence: 0.9 },
    ],
    admin_corrections: [],
    entities: [
      { id: 5, canonical_name: "Patna Metro" },
      { id: 6, canonical_name: "Bihar Cabinet" },
    ],
    article_entities: [
      { article_id: 1, entity_id: 5 },
      { article_id: 1, entity_id: 6 },
    ],
  });
}

describe("correctArticle (Phase 22)", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = seed();
  });

  it("updates changed whitelisted fields with audit rows", async () => {
    const result = await correctArticle(
      db as never,
      1,
      { article_type: "governance", primary_category: "Infrastructure" },
      "reviewed"
    );
    expect(result).toEqual({ updatedFields: ["article_type"], corrections: 1 });
    expect(db.tables["articles"].find((a) => a["id"] === 1)?.["article_type"]).toBe("governance");
    const audits = db.tables["admin_corrections"];
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      article_id: 1,
      story_id: 10,
      field_name: "article_type",
      old_value: "development",
      new_value: "governance",
      reason: "reviewed",
      classifier_version: "rules-v1",
    });
    expect(typeof audits[0]["created_at"]).toBe("string");
  });

  it("ignores unknown fields and skips unchanged values silently", async () => {
    const result = await correctArticle(
      db as never,
      1,
      { article_type: "development", bogus: "x" } as never,
      ""
    );
    expect(result).toEqual({ updatedFields: [], corrections: 0 });
    expect(db.tables["admin_corrections"]).toHaveLength(0);
  });

  it("maps relevance checkbox to scores and audits entities without touching links", async () => {
    const result = await correctArticle(
      db as never,
      3,
      { bihar_relevant: "false", entities: "Patna Metro, New Entity" },
      undefined
    );
    expect(result.updatedFields).toEqual(["bihar_relevance_score"]);
    expect(db.tables["articles"].find((a) => a["id"] === 3)?.["bihar_relevance_score"]).toBe(0.0);
    expect(db.tables["article_entities"]).toHaveLength(2);
    const fields = db.tables["admin_corrections"].map((r) => r["field_name"]);
    expect(fields).toContain("bihar_relevance");
    expect(fields).toContain("entities");
  });

  it("throws for missing articles", async () => {
    await expect(correctArticle(db as never, 999, { article_type: "crime" })).rejects.toThrow();
  });

  it("reads current entity names", async () => {
    expect(await currentEntityNames(db as never, 1)).toEqual(["Patna Metro", "Bihar Cabinet"]);
    expect(await currentEntityNames(db as never, 2)).toEqual([]);
  });
});

describe("story controls (Phase 22)", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = seed();
  });

  it("renames with audit and validates titles", async () => {
    await renameStory(db as never, 10, "  Metro expansion story  ", "better");
    expect(db.tables["stories"].find((s) => s["id"] === 10)?.["canonical_title"]).toBe(
      "Metro expansion story"
    );
    expect(db.tables["admin_corrections"]).toHaveLength(1);
    await expect(renameStory(db as never, 10, "   ")).rejects.toThrow();
  });

  it("moves an article between stories with recount and audit", async () => {
    const { storyId } = await moveArticle(db as never, 3, { kind: "story", id: 10 }, "dup");
    expect(storyId).toBe(10);
    expect(db.tables["articles"].find((a) => a["id"] === 3)?.["story_id"]).toBe(10);
    expect(db.tables["story_articles"].filter((l) => l["story_id"] === 10)).toHaveLength(3);
    expect(db.tables["stories"].find((s) => s["id"] === 10)?.["article_count"]).toBe(3);
    expect(db.tables["stories"].find((s) => s["id"] === 10)?.["source_count"]).toBe(2);
    expect(db.tables["stories"].find((s) => s["id"] === 20)?.["article_count"]).toBe(0);
    const audit = db.tables["admin_corrections"][0];
    expect(audit).toMatchObject({
      article_id: 3,
      story_id: 10,
      field_name: "story_assignment",
      old_value: "20",
      new_value: "10",
    });
  });

  it("moves to a newly created story", async () => {
    const { storyId } = await moveArticle(db as never, 3, { kind: "new", title: "Split out" });
    expect(storyId).toBeGreaterThan(20);
    expect(db.tables["stories"].find((s) => s["id"] === storyId)?.["canonical_title"]).toBe(
      "Split out"
    );
  });

  it("merges all members and parks the source as merged", async () => {
    const { moved } = await mergeStories(db as never, 20, 10, "dup");
    expect(moved).toBe(1);
    expect(db.tables["articles"].find((a) => a["id"] === 3)?.["story_id"]).toBe(10);
    expect(db.tables["stories"].find((s) => s["id"] === 20)?.["status"]).toBe("merged");
    expect(db.tables["stories"].find((s) => s["id"] === 10)?.["article_count"]).toBe(3);
    const fields = db.tables["admin_corrections"].map((r) => r["field_name"]);
    expect(fields).toContain("story_assignment");
    expect(fields).toContain("status");
    await expect(mergeStories(db as never, 10, 10)).rejects.toThrow();
  });

  it("splits a subset into a new story", async () => {
    const { storyId } = await splitStory(db as never, 10, [2], "Second angle", "split");
    expect(db.tables["articles"].find((a) => a["id"] === 2)?.["story_id"]).toBe(storyId);
    expect(db.tables["stories"].find((s) => s["id"] === 10)?.["article_count"]).toBe(1);
    expect(db.tables["stories"].find((s) => s["id"] === storyId)?.["canonical_title"]).toBe(
      "Second angle"
    );
    await expect(splitStory(db as never, 10, [1], "All out")).rejects.toThrow();
    await expect(splitStory(db as never, 10, [999], "Nowhere")).rejects.toThrow();
  });
});
