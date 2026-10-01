// Phase 31 completion gate: district routing and filters work from real
// article/story geography. Route slugs resolve through the canonical
// 38-district dataset (unknown slugs 404); demo stories filter on their
// district names and demo developments/coverage on the fixture articles'
// district slugs — both cross-checked against the reviewed Phase 16
// benchmark file; the live path queries `stories.district_id` and
// `articles.district_id`. Metrics carry sample sizes; districts without
// coverage produce empty sections, never decorative statistics.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDistrict } from "./district";
import { DEMO_ARTICLES } from "./demo-articles";
import { DEMO_STORIES } from "./demo-stories";
import { DISTRICTS, getDistrictBySlug, slugForDistrictName } from "./districts";

interface FixtureArticle {
  id: string;
  story: string | null;
  headline: string;
  source: string;
  published_at: string;
  districts: string[];
}

const FIXTURE = JSON.parse(
  readFileSync(
    join(process.cwd(), "intelligence", "clustering", "tests", "fixtures", "story-clusters.json"),
    "utf8"
  )
) as { articles: FixtureArticle[] };

describe("Phase 31 — district routing resolves real geography", () => {
  it("serves all 38 districts from the reviewed dataset", () => {
    expect(DISTRICTS).toHaveLength(38);
    expect(getDistrictBySlug("patna")?.name).toBe("Patna");
    expect(getDistrictBySlug("gaya")?.name).toBe("Gaya");
    expect(getDistrictBySlug("jamui")?.name).toBe("Jamui");
    expect(getDistrictBySlug("nowhere")).toBeNull();
  });

  it("round-trips every district name to its route slug", () => {
    for (const district of DISTRICTS) {
      expect(slugForDistrictName(district.name), district.name).toBe(district.id);
      expect(getDistrictBySlug(district.id)?.name).toBe(district.name);
    }
  });

  it("every demo story district and fixture article district has a route", () => {
    for (const story of DEMO_STORIES) {
      for (const name of story.districtNames) {
        expect(slugForDistrictName(name), `${story.id}: ${name}`).not.toBeNull();
      }
    }
    const fixtureSlugs = [...new Set(FIXTURE.articles.flatMap((a) => a.districts))];
    expect(fixtureSlugs.length).toBeGreaterThan(0);
    for (const slug of fixtureSlugs) expect(getDistrictBySlug(slug), slug).not.toBeNull();
  });
});

describe("Phase 31 — demo article corpus cross-checks the Phase 16 fixture", () => {
  it("matches every fixture article field (id, story, headline, source, time, districts)", () => {
    expect(DEMO_ARTICLES).toHaveLength(FIXTURE.articles.length);
    for (const fixtureArticle of FIXTURE.articles) {
      const demo = DEMO_ARTICLES.find((a) => a.id === fixtureArticle.id);
      expect(demo, fixtureArticle.id).toBeDefined();
      expect(demo!.story, `${fixtureArticle.id} story`).toBe(fixtureArticle.story ?? null);
      expect(demo!.headline, `${fixtureArticle.id} headline`).toBe(fixtureArticle.headline);
      expect(demo!.source, `${fixtureArticle.id} source`).toBe(fixtureArticle.source);
      expect(demo!.publishedAt, `${fixtureArticle.id} published`).toBe(fixtureArticle.published_at);
      expect(demo!.districts, `${fixtureArticle.id} districts`).toEqual(fixtureArticle.districts);
    }
  });
});

describe("Phase 31 — district data from real geography", () => {
  it("patna: stories by story geography, developments/coverage by article geography", async () => {
    const data = await getDistrict("patna", { demo: true });
    expect(data).not.toBeNull();
    expect(data!.demo).toBe(true);
    expect(data!.district.name).toBe("Patna");

    // Story geography: five stories, newest activity first (s-tender is
    // dated 28 Oct in the fixture).
    expect(data!.stories.map((s) => s.id)).toEqual([
      "s-tender",
      "s-fares",
      "metro-approval",
      "s-robbery",
      "s-cag",
    ]);
    expect(data!.samples.stories).toBe(5);

    // Article geography: nine fixture articles, newest report first.
    expect(data!.samples.articles).toBe(9);
    expect(data!.developments).toHaveLength(9);
    expect(data!.developments[0].headline).toBe("Tenders invited for metro corridor works");
    expect(data!.developments[8].headline).toBe("CAG flags road scheme irregularities");
    expect(data!.developments[8].publishedAt).toBe("2026-09-26T11:00:00+05:30");
    // Fixture articles carry no URLs — never a guessed link.
    for (const development of data!.developments) expect(development.url).toBeNull();

    // Topic distribution over the five stories (count desc, name asc on ties).
    expect(data!.topicCounts).toEqual([
      { category: "Infrastructure", count: 3 },
      { category: "Economy", count: 1 },
      { category: "Governance", count: 1 },
    ]);

    // Source coverage over the nine articles: counts sum to the sample.
    expect(data!.sourceCoverage).toEqual([
      { name: "Dainik Jagran", count: 2 },
      { name: "The Hindu", count: 2 },
      { name: "Dainik Bhaskar Bihar", count: 1 },
      { name: "Economic Times", count: 1 },
      { name: "Indian Express", count: 1 },
      { name: "Prabhat Khabar", count: 1 },
      { name: "Times of India Patna", count: 1 },
    ]);
    expect(data!.sourceCoverage.reduce((sum, s) => sum + s.count, 0)).toBe(data!.samples.articles);
  });

  it("stories land in exactly their named districts (and nowhere else)", async () => {
    const found = new Map<string, string[]>();
    for (const district of DISTRICTS) {
      const data = await getDistrict(district.id, { demo: true });
      expect(data, district.id).not.toBeNull();
      for (const story of data!.stories) {
        const key = String(story.id);
        found.set(key, [...(found.get(key) ?? []), district.id]);
      }
    }
    for (const story of DEMO_STORIES) {
      const expected = story.districtNames
        .map((name) => slugForDistrictName(name))
        .sort() as string[];
      expect((found.get(String(story.id)) ?? []).sort(), String(story.id)).toEqual(expected);
    }
    // Stories without district geography never appear on an archive page.
    expect(found.has("bpsc-calendar")).toBe(false);
    expect(found.has("s-cricket")).toBe(false);
  });

  it("the flood story spans both Supaul and Saharsa with matching geographies", async () => {
    for (const slug of ["supaul", "saharsa"]) {
      const data = await getDistrict(slug, { demo: true });
      expect(
        data!.stories.map((s) => s.id),
        slug
      ).toEqual(["flood-relief"]);
      expect(data!.developments, slug).toHaveLength(3);
      expect(data!.samples, slug).toEqual({ stories: 1, articles: 3 });
      expect(data!.topicCounts, slug).toEqual([{ category: "Environment", count: 1 }]);
    }
    // The story's named districts equal its articles' fixture districts.
    const story = DEMO_STORIES.find((s) => s.id === "flood-relief")!;
    const storySlugs = new Set(story.districtNames.map((n) => slugForDistrictName(n)));
    const articleSlugs = new Set(
      DEMO_ARTICLES.filter((a) => a.story === "flood-relief").flatMap((a) => a.districts)
    );
    expect(articleSlugs).toEqual(storySlugs);
  });

  it("muzaffarpur: single rally story with an uncategorised topic bucket", async () => {
    const data = await getDistrict("muzaffarpur", { demo: true });
    expect(data!.stories.map((s) => s.id)).toEqual(["s-rally"]);
    expect(data!.developments.map((d) => d.headline)).toEqual([
      "Minister attacks rival at Muzaffarpur rally",
    ]);
    expect(data!.topicCounts).toEqual([{ category: null, count: 1 }]);
    expect(data!.sourceCoverage).toEqual([{ name: "Dainik Bhaskar Bihar", count: 1 }]);
  });

  it("an empty district produces no statistics at all", async () => {
    const data = await getDistrict("jamui", { demo: true });
    expect(data!.stories).toEqual([]);
    expect(data!.developments).toEqual([]);
    expect(data!.topicCounts).toEqual([]);
    expect(data!.sourceCoverage).toEqual([]);
    expect(data!.samples).toEqual({ stories: 0, articles: 0 });
  });

  it("unknown slugs 404; the live path is honest without a database", async () => {
    expect(await getDistrict("nowhere", { demo: true })).toBeNull();
    expect(await getDistrict("nowhere")).toBeNull();

    // No Supabase in tests: district still resolves from real geography,
    // with empty data and no error.
    const live = await getDistrict("patna");
    expect(live).not.toBeNull();
    expect(live!.district.name).toBe("Patna");
    expect(live!.demo).toBe(false);
    expect(live!.configured).toBe(false);
    expect(live!.error).toBeNull();
    expect(live!.stories).toEqual([]);
    expect(live!.developments).toEqual([]);
    expect(live!.topicCounts).toEqual([]);
    expect(live!.sourceCoverage).toEqual([]);
  });
});
