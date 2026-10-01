// Phase 34 gate (demo path): the plan's search over story titles, article
// titles, entities, districts, categories and sources with AND-token
// semantics, the seven filters, headline-first ranking, strict parsing, and
// the honest live fallback. Expected sets are hand-verified against the
// reviewed Phase 16 fixture: story-clusters.json (member sources) plus
// demo-story-details entity names and demo-stories fields.
import { describe, expect, it } from "vitest";
import { LIVE_PAGE_SIZE } from "./archive";
import { getSearch, hasSearchCriteria, normalizeSearchText, parseSearchParams } from "./search";

const demo = (sp: Record<string, string>) => parseSearchParams({ ...sp, demo: "1" })!;
const ids = (result: { stories: Array<{ id: string | number }> }) =>
  result.stories.map((story) => story.id);

describe("Phase 34 — strict search parsing", () => {
  it("accepts the plan's query and filter shape", () => {
    expect(parseSearchParams({})).toMatchObject({
      q: "",
      tokens: [],
      district: null,
      category: null,
      articleType: null,
      eventType: null,
      source: null,
      language: null,
      year: null,
      page: 1,
      demo: false,
    });
    expect(
      parseSearchParams({
        q: "  patna  metro ",
        district: "patna",
        category: "education",
        type: "development",
        event: "approval",
        source: "the-hindu",
        language: "hi",
        year: "2026",
        page: "2",
        demo: "1",
      })
    ).toMatchObject({
      q: "patna metro",
      tokens: ["patna", "metro"],
      district: "patna",
      category: "education",
      articleType: "development",
      eventType: "approval",
      source: "the-hindu",
      language: "hi",
      year: 2026,
      page: 2,
      demo: true,
    });
    // Whitespace and commas both split tokens.
    expect(parseSearchParams({ q: "metro, flood" })!.tokens).toEqual(["metro", "flood"]);
    // Empty form fields are "absent", not an error.
    expect(parseSearchParams({ q: "", district: "", year: "", page: "" })).toMatchObject({
      q: "",
      district: null,
      year: null,
      page: 1,
    });
    // Criteria detection drives prompt vs results.
    expect(hasSearchCriteria(parseSearchParams({ demo: "1" })!)).toBe(false);
    expect(hasSearchCriteria(parseSearchParams({ q: "x" })!)).toBe(true);
    expect(hasSearchCriteria(parseSearchParams({ language: "en" })!)).toBe(true);
    expect(parseSearchParams({ q: "x".repeat(100) })).not.toBeNull(); // boundary
  });

  it("rejects unknown filters and malformed values so the page 404s", () => {
    const invalid: Array<Record<string, string | string[]>> = [
      { district: "nope" },
      { category: "nope" },
      { type: "nope" },
      { event: "nope" },
      { source: "nope" },
      { source: "news18-bihar" }, // registry-listed but inactive: no page, no filter
      { language: "fr" },
      { year: "abc" },
      { year: "202" },
      { page: "0" },
      { page: "x" },
      { q: "x".repeat(101) },
      { district: ["patna", "gaya"] }, // repeated param
      { q: ["a", "b"] },
    ];
    for (const sp of invalid) {
      expect(parseSearchParams(sp), JSON.stringify(sp)).toBeNull();
    }
  });
});

describe("Phase 34 — demo search across the plan's fields", () => {
  it("matches story titles, article titles, entities, districts, categories and sources", async () => {
    // Story title field (all three fixtures' story titles carry "metro").
    const metro = await getSearch(demo({ q: "metro" }));
    expect(ids(metro)).toEqual(["s-tender", "s-fares", "metro-approval"]);
    expect(metro.total).toBe(3);

    // AND across tokens with headline-first ranking: metro-approval holds
    // both tokens in its TITLE (tier 1); the others match via district and
    // entity ("Patna Metro" / "Bihta") only (tier 2), newest within tier.
    const both = await getSearch(demo({ q: "patna metro" }));
    expect(ids(both)).toEqual(["metro-approval", "s-tender", "s-fares"]);

    // Entity + article-title fields: "Kosi" appears in an entity name and
    // an article headline, never the story title.
    expect(ids(await getSearch(demo({ q: "kosi" })))).toEqual(["flood-relief"]);
    // Article-title + entity fields ("Bihta" in m1b's headline + entities).
    expect(ids(await getSearch(demo({ q: "bihta" })))).toEqual(["s-tender", "metro-approval"]);
    // District slug + entity fields ("Saran" — no title match anywhere).
    expect(ids(await getSearch(demo({ q: "saran" })))).toEqual(["bridge-collapse"]);
    // Category label field: no title/headline contains "education".
    expect(ids(await getSearch(demo({ q: "education" })))).toEqual(["s-protest", "bpsc-calendar"]);
    // Source name field: registry name "Prabhat Khabar" behind 4 fixture
    // articles (member mapping verified against story-clusters.json).
    expect(ids(await getSearch(demo({ q: "prabhat" })))).toEqual([
      "s-protest",
      "metro-approval",
      "flood-relief",
      "bpsc-calendar",
    ]);
    // Case/hyphen-insensitive normalisation (shared with SQL search_norm):
    // two AND tokens — only metro-approval has both ("Bihar Cabinet"
    // entity + "Cabinet approves…" title; flood has "Bihar Government"
    // but no "cabinet" anywhere).
    expect(normalizeSearchText("Bihar-Cabinet")).toBe("bihar cabinet");
    expect(ids(await getSearch(demo({ q: "BIHAR CABINET" })))).toEqual(["metro-approval"]);

    // Honest empty result — never fabricated matches.
    const none = await getSearch(demo({ q: "zzz-nothing" }));
    expect(none.total).toBe(0);
    expect(none.stories).toEqual([]);
  });

  it("applies every plan filter, AND-combined with the query", async () => {
    // District (5 fixture stories are Patna: metro, s-fares, s-robbery,
    // s-cag, s-tender — s-gdp carries no district; first-seen order).
    expect(ids(await getSearch(demo({ district: "patna" })))).toEqual([
      "s-tender",
      "s-fares",
      "s-robbery",
      "metro-approval",
      "s-cag",
    ]);
    // Category label.
    expect(ids(await getSearch(demo({ category: "education" })))).toEqual([
      "s-protest",
      "bpsc-calendar",
    ]);
    // Event type.
    expect(ids(await getSearch(demo({ event: "approval" })))).toEqual(["metro-approval"]);
    // Source (registry name of the-hindu members).
    expect(ids(await getSearch(demo({ source: "the-hindu" })))).toEqual([
      "metro-approval",
      "flood-relief",
      "s-cag",
    ]);
    // Language (stories whose member coverage includes HI).
    expect(ids(await getSearch(demo({ language: "hi" })))).toEqual([
      "s-rally",
      "s-protest",
      "s-robbery",
      "metro-approval",
      "flood-relief",
      "bpsc-calendar",
    ]);
    // Date (year).
    expect((await getSearch(demo({ year: "2026" }))).total).toBe(12);
    expect((await getSearch(demo({ year: "2025" }))).total).toBe(0);
    // Article type: the fixture carries no article-type labels — an honest
    // zero (the page explains it), never invented types.
    expect((await getSearch(demo({ type: "development" }))).total).toBe(0);

    // Query + filter combine (AND): every token plus the filter. All three
    // "metro" stories are Patna stories, and every one has "metro" in its
    // headline — so the single token is a tier-1 match for all three and
    // first-seen order decides (the same window q=metro alone returns).
    expect(ids(await getSearch(demo({ q: "metro", district: "patna" })))).toEqual([
      "s-tender",
      "s-fares",
      "metro-approval",
    ]);
    expect((await getSearch(demo({ q: "metro", district: "saran" }))).total).toBe(0);
    // prabhat members ∩ Hindi-coverage-false (EN): metro + flood (bpsc and
    // s-protest are HI-only stories).
    expect(ids(await getSearch(demo({ q: "prabhat", language: "en" })))).toEqual([
      "metro-approval",
      "flood-relief",
    ]);
  });

  it("paginates results server-side — the window is never the whole set", async () => {
    // The token "a" is a substring of every fixture story's search fields.
    const page1 = await getSearch(demo({ q: "a" }));
    expect(page1.total).toBe(12);
    expect(page1.totalPages).toBe(2);
    expect(page1.stories).toHaveLength(8);
    expect(page1.pageSize).toBe(8);

    const page2 = await getSearch(demo({ q: "a", page: "2" }));
    expect(page2.page).toBe(2);
    expect(page2.stories).toHaveLength(4);
    // Windows are disjoint and together cover the result set.
    expect(new Set([...ids(page1), ...ids(page2)]).size).toBe(12);

    // Out-of-range pages clamp to real content.
    const clamped = await getSearch(demo({ q: "a", page: "99" }));
    expect(clamped.page).toBe(2);
    expect(clamped.stories).toHaveLength(4);

    // No criteria = browse-all window (the page shows its prompt hint over
    // the same server-paginated grid both paths produce).
    const browse = await getSearch(demo({}));
    expect(browse.total).toBe(12);
    expect(browse.stories).toHaveLength(8);
    expect(hasSearchCriteria(demo({}))).toBe(false);
  });

  it("keeps the live path honest without a database", async () => {
    const result = await getSearch(parseSearchParams({ q: "metro" })!);
    expect(result.configured).toBe(false);
    expect(result.demo).toBe(false);
    expect(result.error).toBeNull();
    expect(result.stories).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(LIVE_PAGE_SIZE);
  });
});
