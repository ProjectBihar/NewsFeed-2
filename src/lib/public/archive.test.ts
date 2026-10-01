// Phase 33 completion gate: large article/story counts remain performant
// because only one page window is ever produced — `paginate` slices a
// 10,000-story archive in bounded time and never returns more than the
// page size; the live path fetches a PostgREST `.range()` window with an
// exact count (backed by the Phase 33 `first_seen_at` index); the demo
// path runs the same window logic over the fixture. Date-based queries
// (`?year=2026&month=09`) bucket strictly by first-reported time, parse
// strictly (malformed → 404), and the archive date cross-checks against
// the reviewed fixture corpus's earliest member article.
import { describe, expect, it } from "vitest";
import {
  DEMO_PAGE_SIZE,
  LIVE_PAGE_SIZE,
  getArchive,
  paginate,
  parseArchiveParams,
} from "./archive";
import { DEMO_ARTICLES, demoArticlesForStory } from "./demo-articles";
import { DEMO_STORIES } from "./demo-stories";

describe("Phase 33 — server-side pagination (the performance gate)", () => {
  it("windows a 10,000-story archive without materialising it", () => {
    const archive = Array.from({ length: 10_000 }, (_, id) => ({ id }));
    const started = performance.now();
    const window = paginate(archive, 123, 20);
    const elapsed = performance.now() - started;

    expect(window.items).toHaveLength(20); // never the archive itself
    expect(window.items[0].id).toBe(2440); // (123 - 1) * 20
    expect(window.total).toBe(10_000);
    expect(window.totalPages).toBe(500);
    expect(elapsed).toBeLessThan(50); // a slice, not a scan

    // Every requested page — first, last, out-of-range — stays bounded.
    for (const page of [1, 2, 500, 501, 999]) {
      const result = paginate(archive, page, 20);
      expect(result.items.length, `page ${page}`).toBeLessThanOrEqual(20);
      expect(result.page, `page ${page}`).toBe(Math.min(page, 500));
    }
  });

  it("clamps out-of-range pages and handles empty archives", () => {
    expect(paginate([], 1, 8)).toEqual({ items: [], page: 1, totalPages: 1, total: 0 });
    expect(paginate([], 99, 8)).toEqual({ items: [], page: 1, totalPages: 1, total: 0 });
    const items = Array.from({ length: 12 }, (_, id) => id);
    expect(paginate(items, 1, 8)).toMatchObject({
      items: [0, 1, 2, 3, 4, 5, 6, 7],
      page: 1,
      totalPages: 2,
      total: 12,
    });
    expect(paginate(items, 2, 8)).toMatchObject({
      items: [8, 9, 10, 11],
      page: 2,
      totalPages: 2,
      total: 12,
    });
    expect(paginate(items, 99, 8)).toMatchObject({ page: 2, totalPages: 2 });
    expect(paginate(items, 0, 8)).toMatchObject({ page: 1 }); // defensive clamp
  });
});

describe("Phase 33 — strict query parsing", () => {
  it("accepts the plan's URL shape and normalises values", () => {
    expect(parseArchiveParams({})).toEqual({
      year: null,
      month: null,
      page: 1,
      demo: false,
    });
    expect(parseArchiveParams({ demo: "1" })).toMatchObject({ demo: true, page: 1 });
    // The plan's example: /archive?year=2026&month=09
    expect(parseArchiveParams({ year: "2026", month: "09" })).toMatchObject({
      year: 2026,
      month: "09",
      page: 1,
    });
    expect(parseArchiveParams({ year: "2026", month: "9" })).toMatchObject({ month: "09" });
    expect(parseArchiveParams({ year: "2026" })).toMatchObject({ year: 2026, month: null });
    expect(parseArchiveParams({ page: "3" })).toMatchObject({ page: 3 });
    // Empty form fields are "absent", not an error.
    expect(parseArchiveParams({ year: "", month: "", page: "" })).toMatchObject({
      year: null,
      month: null,
      page: 1,
    });
  });

  it("rejects malformed queries so the page 404s instead of guessing", () => {
    const invalid: Array<Record<string, string | string[]>> = [
      { year: "abc" },
      { year: "202" },
      { year: "20266" },
      { year: ["2025", "2026"] }, // repeated param
      { year: "2026", month: "13" },
      { year: "2026", month: "0" },
      { year: "2026", month: "sep" },
      { year: "2026", month: "09", page: "0" },
      { year: "2026", month: "09", page: "abc" },
      { month: "09" }, // a month without a year is ambiguous
    ];
    for (const sp of invalid) {
      expect(parseArchiveParams(sp), JSON.stringify(sp)).toBeNull();
    }
    // Empty form fields are "absent", including a month with no year.
    expect(parseArchiveParams({ month: "" })).toMatchObject({ year: null, month: null });
  });
});

describe("Phase 33 — archive data", () => {
  it("pages the fixture newest-first by first report", async () => {
    const page1 = await getArchive(parseArchiveParams({ demo: "1" })!);
    expect(page1.demo).toBe(true);
    expect(page1.error).toBeNull();
    expect(page1.total).toBe(12);
    expect(page1.totalPages).toBe(2);
    expect(page1.page).toBe(1);
    expect(page1.pageSize).toBe(DEMO_PAGE_SIZE);
    // First report order: the October tender first, then 28 Sep by time.
    expect(page1.stories.map((s) => s.id)).toEqual([
      "s-tender",
      "s-cricket",
      "s-fares",
      "s-rally",
      "s-protest",
      "s-robbery",
      "metro-approval",
      "bridge-collapse",
    ]);

    const page2 = await getArchive(parseArchiveParams({ demo: "1", page: "2" })!);
    expect(page2.page).toBe(2);
    expect(page2.stories.map((s) => s.id)).toEqual([
      "s-gdp",
      "flood-relief",
      "bpsc-calendar",
      "s-cag",
    ]);
    // The window never exceeds the page size: 8 + 4 of 12, never 12.
    expect(page1.stories).toHaveLength(8);
    expect(page2.stories).toHaveLength(4);

    // Beyond the last page clamps to real content rather than erroring.
    const clamped = await getArchive(parseArchiveParams({ demo: "1", page: "99" })!);
    expect(clamped.page).toBe(2);
    expect(clamped.stories).toHaveLength(4);
  });

  it("date-based queries bucket exactly by first-reported month", async () => {
    const september = await getArchive(
      parseArchiveParams({ demo: "1", year: "2026", month: "09" })!
    );
    expect(september.total).toBe(11); // all but the 28 Oct tender story
    expect(september.totalPages).toBe(2);
    expect(september.stories.map((s) => s.id)).not.toContain("s-tender");
    expect(september.stories[0]?.id).toBe("s-cricket");

    const secondPage = await getArchive(
      parseArchiveParams({ demo: "1", year: "2026", month: "09", page: "2" })!
    );
    expect(secondPage.stories.map((s) => s.id)).toEqual(["flood-relief", "bpsc-calendar", "s-cag"]);

    const october = await getArchive(parseArchiveParams({ demo: "1", year: "2026", month: "10" })!);
    expect(october.total).toBe(1);
    expect(october.stories.map((s) => s.id)).toEqual(["s-tender"]);

    const yearOnly = await getArchive(parseArchiveParams({ demo: "1", year: "2026" })!);
    expect(yearOnly.total).toBe(12);

    const empty = await getArchive(parseArchiveParams({ demo: "1", year: "2025" })!);
    expect(empty.total).toBe(0);
    expect(empty.stories).toEqual([]);
    expect(empty.totalPages).toBe(1); // honest single empty page
  });

  it("every archive date equals the story's earliest member article", () => {
    expect(DEMO_ARTICLES.length).toBeGreaterThan(0);
    for (const story of DEMO_STORIES) {
      const members = demoArticlesForStory(String(story.id));
      expect(members.length, String(story.id)).toBeGreaterThan(0);
      const earliest = members.map((member) => member.publishedAt).sort()[0];
      expect(story.firstSeenAt, String(story.id)).toBe(earliest);
    }
  });
});

describe("Phase 33 — honest live path", () => {
  it("keeps the live window empty and labeled without a database", async () => {
    const data = await getArchive(parseArchiveParams({ year: "2026" })!);
    expect(data.configured).toBe(false);
    expect(data.demo).toBe(false);
    expect(data.error).toBeNull();
    expect(data.stories).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(LIVE_PAGE_SIZE);
  });
});
