// Phase 32 completion gate: each active source has a stable public page.
// Slugs derive deterministically from the reviewed registry (the same file
// that seeds the `sources` table), so demo and live URLs always agree and
// stay independent of database state; inactive and unknown slugs 404; the
// public shape carries only reader-facing fields — crawler diagnostics
// (endpoints, verification, priority, wave, notes) never cross the border;
// demo coverage derives from the reviewed fixture corpus, article by
// article, with every metric carrying its sample size.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSource } from "./source";
import { DEMO_ARTICLES } from "./demo-articles";
import { DEMO_STORIES } from "./demo-stories";
import { demoPublisher } from "./demo-story-details";
import { SOURCES, getSourceBySlug, slugForSourceName, slugifySourceName } from "./sources";

interface RegistrySource {
  name: string;
  domain: string;
  language: string;
  scope: string;
  source_type: string;
  active: boolean;
  priority: string;
  wave: string;
  notes: string;
  requires_browser: boolean;
  group: string;
  endpoints: Array<{ url: string; verification: string }>;
}

const REGISTRY = JSON.parse(
  readFileSync(join(process.cwd(), "data", "sources", "registry.json"), "utf8")
) as { sources: RegistrySource[] };

describe("Phase 32 — stable public routes for active sources", () => {
  it("derives a stable unique slug for every active registry source", () => {
    const active = REGISTRY.sources.filter((s) => s.active);
    const inactive = REGISTRY.sources.filter((s) => !s.active);
    expect(REGISTRY.sources.filter((s) => s.wave === "A")).toHaveLength(14);
    expect(active.map((s) => s.name)).toContain("Patna Press");
    expect(SOURCES).toHaveLength(active.length);

    const slugs = new Set(SOURCES.map((s) => s.slug));
    expect(slugs.size).toBe(SOURCES.length); // no collisions

    for (const entry of active) {
      const slug = slugifySourceName(entry.name);
      expect(getSourceBySlug(slug)?.name, entry.name).toBe(entry.name);
      expect(getSourceBySlug(slug)?.language).toBe(entry.language);
    }
    // Inactive entries are not published.
    for (const entry of inactive) {
      expect(getSourceBySlug(slugifySourceName(entry.name)), entry.name).toBeNull();
    }
    // The plan's example URL resolves.
    expect(getSourceBySlug("the-hindu")?.name).toBe("The Hindu");
    expect(getSourceBySlug("nowhere")).toBeNull();
  });

  it("the gate sweep: every active source resolves demo and live identically", async () => {
    for (const source of SOURCES) {
      const demoPage = await getSource(source.slug, { demo: true });
      expect(demoPage, source.slug).not.toBeNull();
      expect(demoPage!.source).toEqual(source);
      expect(demoPage!.demo).toBe(true);

      const livePage = await getSource(source.slug);
      expect(livePage, source.slug).not.toBeNull();
      // The page is registry-driven: identical facts without a database.
      expect(livePage!.source).toEqual(source);
    }
    // Inactive slugs, unknown slugs, and internal fixture slugs never resolve
    // (one canonical page per source — no parallel aliases).
    const inactiveSlugs = REGISTRY.sources
      .filter((s) => !s.active)
      .map((s) => slugifySourceName(s.name));
    expect(inactiveSlugs).toContain("news18-bihar");
    for (const slug of [...inactiveSlugs, "nowhere", "toi"]) {
      expect(await getSource(slug, { demo: true }), slug).toBeNull();
      expect(await getSource(slug), slug).toBeNull();
    }
  });

  it("exposes only reader-facing fields — crawler diagnostics stay admin-side", () => {
    expect(Object.keys(SOURCES[0]).sort()).toEqual([
      "domain",
      "language",
      "name",
      "scope",
      "slug",
      "sourceType",
    ]);
    const json = JSON.stringify(SOURCES);
    // No fetched endpoint URL and no verification note ever crosses over.
    const endpointUrls = REGISTRY.sources.flatMap((s) => s.endpoints.map((e) => e.url));
    expect(endpointUrls.length).toBeGreaterThan(0);
    for (const url of endpointUrls) expect(json).not.toContain(url);
    for (const entry of REGISTRY.sources) expect(json).not.toContain(entry.notes);
    // Domains only — never a protocol-bearing URL from the crawler config.
    expect(json).not.toMatch(/https?:\/\//);
    for (const field of [
      "endpoints",
      "verification",
      "priority",
      "wave",
      "notes",
      "requires_browser",
      "group",
      "active",
    ]) {
      expect(json, field).not.toContain(`"${field}"`);
    }
  });
});

describe("Phase 32 — demo coverage from the fixture corpus", () => {
  it("every fixture article lands on exactly its registry source's page (or none)", async () => {
    const expectedByName = new Map<string, number>();
    const unregistered: string[] = [];
    for (const article of DEMO_ARTICLES) {
      const name = demoPublisher(article.source).name;
      if (slugForSourceName(name) === null) {
        unregistered.push(article.id);
        continue;
      }
      expectedByName.set(name, (expectedByName.get(name) ?? 0) + 1);
    }
    // Only the fixture-only source (Business Standard) has no registry page.
    expect(unregistered).toEqual(["s-gdp"]);

    let matched = 0;
    for (const source of SOURCES) {
      const data = await getSource(source.slug, { demo: true });
      const expected = expectedByName.get(source.name) ?? 0;
      expect(data!.coverage?.articles ?? 0, source.name).toBe(expected);
      if (data!.coverage) {
        expect(data!.coverage.sample, source.name).toBe(DEMO_ARTICLES.length);
      }
      matched += data!.coverage?.articles ?? 0;
    }
    // Bijection: registered coverage + unregistered articles = the corpus.
    expect(matched).toBe(20);
    expect(matched + unregistered.length).toBe(DEMO_ARTICLES.length);
  });

  it("every demo story appears on each of its sources' pages (and nowhere else)", async () => {
    const expectedCovered = new Set<string>();
    const expectedUncovered: string[] = [];
    for (const story of DEMO_STORIES) {
      const members = DEMO_ARTICLES.filter((a) => a.story === story.id || a.id === story.id);
      const covered = members.some((a) => slugForSourceName(demoPublisher(a.source).name) !== null);
      if (covered) expectedCovered.add(String(story.id));
      else expectedUncovered.push(String(story.id));
    }
    // s-gdp's only report is from the unregistered fixture source.
    expect(expectedUncovered).toEqual(["s-gdp"]);

    const found = new Set<string>();
    for (const source of SOURCES) {
      const data = await getSource(source.slug, { demo: true });
      for (const story of data!.stories) found.add(String(story.id));
    }
    expect([...found].sort()).toEqual([...expectedCovered].sort());
  });

  it("The Hindu: newest-first articles, member stories, districts, sample size", async () => {
    const data = await getSource("the-hindu", { demo: true });
    expect(data).not.toBeNull();
    expect(data!.demo).toBe(true);
    expect(data!.error).toBeNull();

    // Three fixture reports, newest first; no article URLs — never guessed.
    expect(data!.articles.map((a) => a.headline)).toEqual([
      "Cabinet approves Patna Metro expansion",
      "Relief camps house 40,000 in north Bihar",
      "CAG flags road scheme irregularities",
    ]);
    for (const article of data!.articles) expect(article.url).toBeNull();
    expect(data!.articles.map((a) => a.districts)).toEqual([
      ["patna"],
      ["supaul", "saharsa"],
      ["patna"],
    ]);

    expect(data!.coverage).toEqual({
      articles: 3,
      stories: 3,
      districts: 3,
      sample: 21,
    });

    // Member stories, newest activity first (metro 16:30, flood 09:00 on
    // 28 Sep; the CAG story is older).
    expect(data!.stories.map((s) => s.id)).toEqual(["metro-approval", "flood-relief", "s-cag"]);
  });

  it("Times of India Patna: fixture slug 'toi' resolves the registry page", async () => {
    const data = await getSource("times-of-india-patna", { demo: true });
    expect(data).not.toBeNull();
    // The 28 Oct tender report is newest, the bridge report older.
    expect(data!.articles.map((a) => a.headline)).toEqual([
      "Tenders invited for metro corridor works",
      "Under-construction Gandak bridge caves in",
    ]);
    expect(data!.coverage).toEqual({
      articles: 2,
      stories: 2,
      districts: 2,
      sample: 21,
    });
    expect(data!.stories.map((s) => s.id)).toEqual(["s-tender", "bridge-collapse"]);
    // The internal fixture alias is not a second page.
    expect(await getSource("toi", { demo: true })).toBeNull();
  });

  it("active sources without fixture coverage render honest empties", async () => {
    for (const slug of ["mongabay-india", "prs-legislative-research"]) {
      const data = await getSource(slug, { demo: true });
      expect(data, slug).not.toBeNull();
      expect(data!.demo).toBe(true);
      expect(data!.articles).toEqual([]);
      expect(data!.stories).toEqual([]);
      expect(data!.coverage, slug).toBeNull();
    }
  });
});

describe("Phase 32 — live path honest without a database", () => {
  it("renders registry facts and keeps coverage empty", async () => {
    const data = await getSource("the-hindu");
    expect(data).not.toBeNull();
    expect(data!.configured).toBe(false);
    expect(data!.demo).toBe(false);
    expect(data!.error).toBeNull();
    expect(data!.source).toEqual({
      slug: "the-hindu",
      name: "The Hindu",
      domain: "thehindu.com",
      language: "en",
      scope: "national",
      sourceType: "news",
    });
    expect(data!.articles).toEqual([]);
    expect(data!.stories).toEqual([]);
    expect(data!.coverage).toBeNull();
  });

  it("maps display names to canonical slugs and refuses guesses", () => {
    expect(slugForSourceName("The Hindu")).toBe("the-hindu");
    expect(slugForSourceName("Times of India Patna")).toBe("times-of-india-patna");
    expect(slugForSourceName("Dainik Jagran")).toBe("dainik-jagran");
    // Fixture-only source: named honestly, never a guessed route.
    expect(slugForSourceName("Business Standard")).toBeNull();
    for (const fixtureSlug of [
      "the-hindu",
      "indian-express",
      "jagran",
      "prabhat-khabar",
      "bhaskar",
      "toi",
      "et",
    ]) {
      const name = demoPublisher(fixtureSlug).name;
      expect(slugForSourceName(name), fixtureSlug).not.toBeNull();
    }
    expect(slugForSourceName(demoPublisher("business-standard").name)).toBeNull();
  });
});
