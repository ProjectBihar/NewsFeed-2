// Phase 34 completion gate: "Search works on representative archive-scale
// data." The SQL search runs for real against embedded PGlite (WASM
// Postgres) with ALL migrations applied — including search_story_ids — over
// a deterministic seed of 3,000 stories × 2 articles (6,000 articles,
// 6,000 memberships, 302 entities), planted with a needle for every branch
// of the plan's field list (story title, article title, entity, district,
// category, source) plus every filter (date, district, category, article
// type, event type, source, language).
//
// Assertions: exact recall per branch, AND-token semantics, headline-first
// ranking (a title match with an OLDER date still outranks a newer
// non-title match), exact filter counts at scale, disjoint pagination
// windows, the 100-id hard cap (the archive is never shipped whole), LIKE
// escaping of user tokens, honest empty results, and a wall-clock bound on
// a representative query.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const STORIES = 3000;
const DISTRICTS8 = [
  "patna",
  "gaya",
  "supaul",
  "saran",
  "muzaffarpur",
  "bhagalpur",
  "vaishali",
  "nalanda",
];
const CATEGORIES4 = ["Economy", "Infrastructure", "Education", "Healthcare"];
const EVENTS4 = ["approval", "tender", "protest", null] as const;
const TYPES4 = ["development", "governance", "sports", null] as const;
const SOURCES4 = ["Dainik Jagran", "The Hindu", "Prabhat Khabar", "Dainik Bhaskar Bihar"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function baseTitle(i: number): string {
  if (i === 100) return "Metro corridor financing approved in Patna";
  if (i === 200) return "Bridge inspection ordered after rain";
  return `Ward development review ${i}`;
}

function districtOf(i: number): string {
  if (i === 100) return "patna"; // planted district needle
  return DISTRICTS8[i % 8];
}

function sourceOf(i: number): string {
  if (i === 400) return "Arya Dainik"; // planted source-name needle
  return SOURCES4[i % 4];
}

function firstSeenOf(i: number): string {
  if (i === 100) return "2026-01-05T09:00:00+05:30"; // title needle, OLDER date
  if (i === 300) return "2026-11-10T09:00:00+05:30"; // article needle, NEWER date
  if (i === 999) return "2025-06-15T09:00:00+05:30"; // year-filter needle
  const month = (i % 12) + 1;
  const day = (i % 27) + 1;
  return `2026-${pad(month)}-${pad(day)}T09:00:00+05:30`;
}

function headlineOf(i: number, k: number): string {
  if (i === 300 && k === 2) return "Special Metro bulletin for commuters";
  return `Official update ${k} on scheme ${i}`;
}

interface SearchArgs {
  tokens?: string[] | null;
  district?: string | null;
  category?: string | null;
  event?: string | null;
  articleType?: string | null;
  source?: string | null;
  language?: string | null;
  year?: number | null;
  limit?: number | null;
  offset?: number | null;
}

describe("Phase 34 — search_story_ids at archive scale (PGlite)", () => {
  let db: PGlite;
  let storyIdByTitle = new Map<string, number>();
  let articleIdByUrl = new Map<string, number>();
  let entityIdByName = new Map<string, number>();
  let metroTitleId = 0;
  let metroArticleStoryId = 0;

  async function search(args: SearchArgs): Promise<{ total: number; ids: number[] }> {
    const res = await db.query<{ result: unknown }>(
      `SELECT public.search_story_ids($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS result`,
      [
        args.tokens ?? null,
        args.district ?? null,
        args.category ?? null,
        args.event ?? null,
        args.articleType ?? null,
        args.source ?? null,
        args.language ?? null,
        args.year ?? null,
        args.limit ?? null,
        args.offset ?? null,
      ]
    );
    const raw = res.rows[0].result;
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as { total: number; ids: number[] };
  }

  beforeAll(async () => {
    db = new PGlite();
    for (const file of readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    }

    // Sources: the four background sources already exist (the Phase 3
    // migration seeds the registry — same names, so src.name = matches the
    // live contract). Only the planted needle source is new.
    await db.query(
      `INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)
       VALUES ('Arya Dainik', 'aryadainik.com', 'hi', 'bihar', 'news', 'medium', TRUE)
       ON CONFLICT (domain) DO NOTHING`
    );
    const sourceRows = await db.query<{ id: number; name: string }>(
      `SELECT id, name FROM sources WHERE name IN ('Dainik Jagran', 'The Hindu', 'Prabhat Khabar', 'Dainik Bhaskar Bihar', 'Arya Dainik')`
    );
    expect(sourceRows.rows).toHaveLength(5);
    const sourceIdByName = new Map(sourceRows.rows.map((row) => [row.name, row.id]));

    // Stories (3000) in batches of 500.
    for (let start = 1; start <= STORIES; start += 500) {
      const values: string[] = [];
      for (let i = start; i < Math.min(start + 500, STORIES + 1); i += 1) {
        const category = CATEGORIES4[i % 4];
        const event = EVENTS4[i % 4];
        const seen = firstSeenOf(i);
        values.push(
          `('${baseTitle(i)}', '${category}', ${event === null ? "NULL" : `'${event}'`}, '${districtOf(i)}', '${seen}', '${seen}')`
        );
      }
      await db.query(
        `INSERT INTO stories (canonical_title, primary_category, event_type, district_id, first_seen_at, last_seen_at) VALUES ${values.join(",")}`
      );
    }
    const storyRows = await db.query<{ id: number; canonical_title: string }>(
      `SELECT id, canonical_title FROM stories`
    );
    storyIdByTitle = new Map(storyRows.rows.map((row) => [row.canonical_title, row.id]));
    metroTitleId = storyIdByTitle.get(baseTitle(100))!;
    metroArticleStoryId = storyIdByTitle.get(baseTitle(300))!;

    // Articles (2 per story); memberships are wired from the returned urls
    // below, once real article ids exist.
    for (let start = 1; start <= STORIES; start += 500) {
      const articleValues: string[] = [];
      for (let i = start; i < Math.min(start + 500, STORIES + 1); i += 1) {
        const storyId = storyIdByTitle.get(baseTitle(i))!;
        const category = CATEGORIES4[i % 4];
        const event = EVENTS4[i % 4];
        const district = districtOf(i);
        const seen = firstSeenOf(i);
        const sourceId = sourceIdByName.get(sourceOf(i))!;
        for (const k of [1, 2]) {
          const url = `https://seed.example/${i}/${k}`;
          const plantedType = k === 1 && (i === 500 || i === 501) ? "crime" : TYPES4[(i + k) % 4];
          const language = k === 1 ? "hi" : "en";
          articleValues.push(
            `(${sourceId}, '${url}', '${url}', '${headlineOf(i, k)}', 'hash-${i}-${k}', 'seed body ${i}-${k}', '${language}', '${seen}', 'content-${i}-${k}', 'high', 0.8, ${plantedType === null ? "NULL" : `'${plantedType}'`}, '${category}', ${event === null ? "NULL" : `'${event}'`}, '${district}', ${storyId}, ${k === 1 ? "FALSE" : "TRUE"})`
          );
        }
      }
      await db.query(
        `INSERT INTO articles (source_id, url, canonical_url, headline, headline_hash, description, language, published_at, content_hash, extraction_confidence, bihar_relevance_score, article_type, primary_category, event_type, district_id, story_id, curated) VALUES ${articleValues.join(",")}`
      );
    }

    // Real memberships: every article belongs to its story (url → story).
    const articleRows = await db.query<{ id: number; url: string; story_id: number }>(
      `SELECT id, url, story_id FROM articles`
    );
    articleIdByUrl = new Map(articleRows.rows.map((row) => [row.url, row.id]));
    const membershipValues: string[] = [];
    for (const row of articleRows.rows) {
      membershipValues.push(`(${row.story_id}, ${row.id}, 0.9)`);
      if (membershipValues.length >= 1000) {
        await db.query(
          `INSERT INTO story_articles (story_id, article_id, cluster_score) VALUES ${membershipValues.join(",")}`
        );
        membershipValues.length = 0;
      }
    }
    if (membershipValues.length > 0) {
      await db.query(
        `INSERT INTO story_articles (story_id, article_id, cluster_score) VALUES ${membershipValues.join(",")}`
      );
    }
    // (story 300's id captured above; article ids only needed for links)

    // Entities: 300 background committee entities (every 10th story) plus
    // two planted needles, linked from their stories' articles.
    const entityValues: string[] = [];
    for (let i = 10; i <= STORIES; i += 10) {
      entityValues.push(`('Committee ${i} Review', 'major_project', '${districtOf(i)}')`);
    }
    entityValues.push(`('Bihar Cabinet', 'major_project', 'patna')`);
    entityValues.push(`('Gandak Panel', 'major_project', '${districtOf(200)}')`);
    const entityRows = await db.query<{ id: number; canonical_name: string }>(
      `INSERT INTO entities (canonical_name, entity_type, district_id) VALUES ${entityValues.join(",")} RETURNING id, canonical_name`
    );
    entityIdByName = new Map(entityRows.rows.map((row) => [row.canonical_name, row.id]));

    const linkValues: string[] = [];
    for (let i = 10; i <= STORIES; i += 10) {
      const articleId = articleIdByUrl.get(`https://seed.example/${i}/1`)!;
      linkValues.push(
        `(${articleId}, ${entityIdByName.get(`Committee ${i} Review`)!}, 0.9, '["seed"]')`
      );
    }
    linkValues.push(
      `(${articleIdByUrl.get("https://seed.example/100/1")!}, ${entityIdByName.get("Bihar Cabinet")!}, 0.9, '["seed"]')`
    );
    linkValues.push(
      `(${articleIdByUrl.get("https://seed.example/200/2")!}, ${entityIdByName.get("Gandak Panel")!}, 0.9, '["seed"]')`
    );
    await db.query(
      `INSERT INTO article_entities (article_id, entity_id, confidence, evidence) VALUES ${linkValues.join(",")}`
    );
  }, 240_000);

  it("normalises and LIKE-escapes tokens in SQL (shared with the demo path)", async () => {
    const norm = await db.query<{ result: string }>(
      `SELECT public.search_norm('Bihar-Cabinet') AS result`
    );
    expect(norm.rows[0].result).toBe("bihar cabinet");
    const pattern = await db.query<{ result: string }>(
      `SELECT public.search_token_pattern('50_2%') AS result`
    );
    expect(pattern.rows[0].result).toBe("%50 2\\%%"); // _ folded, % escaped
  });

  it("finds every plan branch: title, article title, entity, district, category, source", async () => {
    // Story title branch — planted needle + the article-title needle.
    const metro = await search({ tokens: ["metro"] });
    expect(metro.total).toBe(2);
    expect(metro.ids).toEqual([metroTitleId, metroArticleStoryId]); // title tier first…
    // …despite the title needle having the OLDER date (ranking, not recency).
    // AND tokens: only story 100 has both "metro" and "financing".
    const both = await search({ tokens: ["metro", "financing"] });
    expect(both.total).toBe(1);
    expect(both.ids).toEqual([metroTitleId]);
    // Article-title branch (story 300: base story title, "Metro" headline).
    expect((await search({ tokens: ["commuters"] })).ids).toEqual([metroArticleStoryId]);
    // Entity branch: 300 background committee entities + planted names.
    const committee = await search({ tokens: ["committee"] });
    expect(committee.total).toBe(300);
    expect((await search({ tokens: ["gandak"] })).total).toBe(1);
    expect((await search({ tokens: ["cabinet"] })).total).toBe(1);
    // District slug branch: same count as the district FILTER (376 — 375
    // cycle members + planted story 100) and includes the needle.
    const patnaText = await search({ tokens: ["patna"] });
    const patnaFilter = await search({ district: "patna" });
    expect(patnaText.total).toBe(376);
    expect(patnaText.total).toBe(patnaFilter.total);
    expect(patnaText.ids).toContain(metroTitleId);
    // Category label branch: the Education quarter (750 stories).
    expect((await search({ tokens: ["education"] })).total).toBe(750);
    // Source name/domain branch: Prabhat Khabar members (750)…
    expect((await search({ tokens: ["prabhat"] })).total).toBe(750);
    // …and the planted fifth source (name AND domain both match).
    const arya = await search({ tokens: ["arya"] });
    expect(arya.total).toBe(1);
    expect((await search({ source: "Arya Dainik" })).ids).toEqual(arya.ids);
    // No match → honest empty.
    expect(await search({ tokens: ["zzzquux"] })).toEqual({ total: 0, ids: [] });
  }, 60_000);

  it("applies every plan filter with exact counts at scale", async () => {
    expect((await search({ year: 2026 })).total).toBe(STORIES - 1); // one planted 2025
    expect((await search({ year: 2025 })).total).toBe(1);
    expect((await search({ district: "patna" })).total).toBe(376);
    expect((await search({ category: "Education" })).total).toBe(750);
    expect((await search({ event: "tender" })).total).toBe(750); // event cycle quarter
    expect((await search({ articleType: "crime" })).total).toBe(2); // planted only
    expect((await search({ source: "Dainik Jagran" })).total).toBe(749); // story 400 moved to Arya
    expect((await search({ language: "hi" })).total).toBe(STORIES); // article 1 of every story
    expect((await search({ language: "en" })).total).toBe(STORIES); // article 2 of every story
    // AND-combination of text + filters.
    expect((await search({ tokens: ["gandak"], event: "approval" })).total).toBe(1);
    expect((await search({ tokens: ["gandak"], event: "protest" })).total).toBe(0);
    expect((await search({ tokens: ["ward"], year: 2025 })).total).toBe(1);
    expect((await search({ tokens: ["metro"], district: "saran" })).total).toBe(0);
  }, 60_000);

  it("pages results in disjoint windows and never ships the whole archive", async () => {
    // Entity-branch result set (300) paged by 20.
    const first = await search({ tokens: ["committee"], limit: 20, offset: 0 });
    const second = await search({ tokens: ["committee"], limit: 20, offset: 20 });
    expect(first.total).toBe(300);
    expect(first.ids).toHaveLength(20);
    expect(second.ids).toHaveLength(20);
    expect(new Set([...first.ids, ...second.ids]).size).toBe(40); // disjoint
    // Offset past the end: honest empty window, stable total.
    expect(await search({ tokens: ["committee"], limit: 20, offset: 300 })).toEqual({
      total: 300,
      ids: [],
    });
    // Filters-only scan over the whole table still windows at 20.
    const all = await search({ limit: 20, offset: 0 });
    expect(all.total).toBe(STORIES);
    expect(all.ids).toHaveLength(20);
    // The hard cap: a huge limit returns at most 100 ids — the full archive
    // is never shipped, no matter what the caller asks for.
    const greedy = await search({ limit: 100_000, offset: 0 });
    expect(greedy.total).toBe(STORIES);
    expect(greedy.ids.length).toBeLessThanOrEqual(100);
    const beyond = await search({ tokens: ["committee"], limit: 20, offset: 500 });
    expect(beyond.ids).toEqual([]);
    expect(beyond.total).toBe(300);
  }, 60_000);

  it("answers a representative search within a wall-clock bound", async () => {
    const started = performance.now();
    const result = await search({ tokens: ["committee"], language: "hi", limit: 20 });
    const elapsed = performance.now() - started;
    expect(result.total).toBe(300);
    expect(result.ids).toHaveLength(20);
    expect(elapsed).toBeLessThan(1500); // set-based scans at archive scale
  }, 60_000);
});
