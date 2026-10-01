// Phase 30 completion gate — part 1: story-page provenance. The demo
// report corpus (demo-articles.ts) and entities (demo-story-details.ts) are
// cross-checked against the reviewed Phase 16 fixture file (ids, sources,
// timestamps, entity slugs, ordering), publisher links resolve through the
// source registry, and the live row mapping + Bihar-time stamps are
// unit-tested.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_ARTICLES, demoArticlesForStory } from "./demo-articles";
import { DEMO_ENTITIES, demoPublisher } from "./demo-story-details";
import { DEMO_STORIES } from "./demo-stories";
import { getStory, sortReports, toStoryDetail } from "./story";
import { formatStamp } from "./time-ago";

interface FixtureArticle {
  id: string;
  story: string | null;
  source: string;
  published_at: string;
  entities: string[];
  headline: string;
}

const FIXTURE = JSON.parse(
  readFileSync(
    join(process.cwd(), "intelligence", "clustering", "tests", "fixtures", "story-clusters.json"),
    "utf8"
  )
) as { articles: FixtureArticle[] };

const REGISTRY = JSON.parse(
  readFileSync(join(process.cwd(), "data", "sources", "registry.json"), "utf8")
) as { sources: Array<{ name: string; domain: string }> };

/** Fixture members of a demo story: `story: <id>` groups for multi-article
 *  stories; the article whose id equals the story id for singletons. */
function membersOf(storyId: string): FixtureArticle[] {
  return FIXTURE.articles.filter((a) => a.story === storyId || a.id === storyId);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

describe("Phase 30 — demo reports cross-check the Phase 16 fixture", () => {
  it("the corpus covers exactly the twelve demo stories (no orphan articles)", () => {
    for (const story of DEMO_STORIES) {
      expect(demoArticlesForStory(String(story.id)).length).toBeGreaterThan(0);
    }
    // Every corpus article's owner is a demo story (its fixture story group,
    // or — for singletons — itself), and those owners are all twelve stories.
    const owners = new Set<string>();
    for (const article of DEMO_ARTICLES) {
      const owner = article.story ?? article.id;
      expect(
        DEMO_STORIES.some((s) => String(s.id) === owner),
        article.id
      ).toBe(true);
      owners.add(owner);
    }
    expect([...owners].sort()).toEqual(DEMO_STORIES.map((s) => String(s.id)).sort());
  });

  it("matches fixture member articles (id, source, timestamp) and card counts", () => {
    for (const story of DEMO_STORIES) {
      const id = String(story.id);
      const members = membersOf(id);
      const articles = demoArticlesForStory(id);
      expect(articles.length, `${id} reports`).toBe(members.length);
      for (const member of members) {
        const article = articles.find((a) => a.id === member.id);
        expect(article, `${id}/${member.id} present`).toBeDefined();
        expect(article?.source, `${id}/${member.id} source`).toBe(member.source);
        expect(article?.publishedAt, `${id}/${member.id} published`).toBe(member.published_at);
      }
      // Counts shown on the card stay consistent with provenance rows.
      expect(articles.length, `${id} articleCount`).toBe(story.articleCount);
      expect(new Set(members.map((m) => m.source)).size, `${id} sourceCount`).toBe(
        story.sourceCount
      );
    }
  });

  it("ties singletons to their fixture article (shared ids, same headline)", () => {
    const singletons = DEMO_STORIES.filter((s) => s.articleCount === 1);
    expect(singletons).toHaveLength(8);
    for (const story of singletons) {
      const id = String(story.id);
      const articles = demoArticlesForStory(id);
      expect(articles).toHaveLength(1);
      expect(articles[0].id).toBe(id);
      const member = membersOf(id)[0];
      expect(member.story).toBeNull();
      expect(member.headline).toBe(story.canonicalTitle);
    }
  });
});

describe("Phase 30 — demo entities cross-check fixture entity slugs", () => {
  it("display names round-trip to exactly the fixture member union", () => {
    for (const story of DEMO_STORIES) {
      const id = String(story.id);
      const fixtureSlugs = new Set(membersOf(id).flatMap((a) => a.entities));
      const display = DEMO_ENTITIES[id] ?? [];
      expect(new Set(display.map(slugify)), id).toEqual(fixtureSlugs);
      expect(display.length, `${id} no duplicates`).toBe(fixtureSlugs.size);
    }
  });

  it("orders by fixture mention count (desc, slug asc on ties)", () => {
    for (const story of DEMO_STORIES) {
      const id = String(story.id);
      const counts = new Map<string, number>();
      for (const member of membersOf(id)) {
        for (const slug of member.entities) {
          counts.set(slug, (counts.get(slug) ?? 0) + 1);
        }
      }
      const expected = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([slug]) => slug);
      const actual = (DEMO_ENTITIES[id] ?? []).map(slugify);
      expect(actual, id).toEqual(expected);
    }
  });
});

describe("Phase 30 — publisher links resolve through the source registry", () => {
  const REGISTERED_SLUGS = [
    "the-hindu",
    "indian-express",
    "jagran",
    "prabhat-khabar",
    "bhaskar",
    "toi",
    "et",
  ];

  it("registered fixture sources link to their real homepage", () => {
    for (const slug of REGISTERED_SLUGS) {
      const publisher = demoPublisher(slug);
      const entry = REGISTRY.sources.find((s) => s.name === publisher.name);
      expect(entry, `${slug} in registry`).toBeDefined();
      expect(publisher.homepage).toBe(`https://${entry?.domain}`);
    }
  });

  it("unknown sources keep a prettified name with no fabricated link", () => {
    expect(demoPublisher("business-standard")).toEqual({
      name: "Business Standard",
      homepage: null,
    });
  });
});

describe("Phase 30 — getStory", () => {
  it("demo: full metro detail with first-reported report order", async () => {
    const story = await getStory("metro-approval", { demo: true });
    expect(story).not.toBeNull();
    expect(story!.demo).toBe(true);
    expect(story!.canonicalTitle).toBe("Cabinet approves Patna Metro expansion");
    expect(story!.primaryCategory).toBe("Infrastructure");
    expect(story!.eventType).toBe("approval");
    expect(story!.districtNames).toEqual(["Patna"]);
    expect(story!.firstSeenAt).toBe("2026-09-28T10:00:00+05:30");
    expect(story!.lastSeenAt).toBe("2026-09-28T16:30:00+05:30");
    expect(story!.articleCount).toBe(5);
    expect(story!.sourceCount).toBe(5);
    expect(story!.languages).toEqual(["EN", "HI"]);
    expect(story!.reports.map((r) => r.sourceName)).toEqual([
      "The Hindu",
      "Indian Express",
      "Dainik Jagran",
      "Prabhat Khabar",
      "Dainik Bhaskar Bihar",
    ]);
    for (const report of story!.reports) expect(report.url).toMatch(/^https:\/\//);
    expect(story!.reports[0].publishedAt).toBe("2026-09-28T10:00:00+05:30");
    expect(story!.entities).toEqual(["Bihar Cabinet", "Patna Metro", "Bihta", "Patna"]);
  });

  it("demo: entity-less story keeps one report; unregistered source stays unlinked", async () => {
    const rally = await getStory("s-rally", { demo: true });
    expect(rally!.reports).toHaveLength(1);
    expect(rally!.entities).toEqual([]);
    expect(rally!.reports[0].sourceName).toBe("Dainik Bhaskar Bihar");
    const gdp = await getStory("s-gdp", { demo: true });
    expect(gdp!.reports[0].sourceName).toBe("Business Standard");
    expect(gdp!.reports[0].url).toBeNull();
  });

  it("unknown demo id → null; live id → null without a configured database", async () => {
    expect(await getStory("nope", { demo: true })).toBeNull();
    expect(await getStory("not-even-numeric")).toBeNull();
    expect(await getStory("1")).toBeNull(); // no Supabase configured in tests
  });
});

describe("Phase 30 — live row mapping and timestamps", () => {
  it("maps a detail row: languages, district, sorted report links", () => {
    const detail = toStoryDetail({
      id: 7,
      canonical_title: "State GDP growth pegged at 9.2 percent",
      primary_category: "Economy",
      event_type: "report",
      district_id: "patna",
      article_count: 2,
      source_count: 2,
      first_seen_at: "2026-09-28T04:30:00+00:00",
      last_seen_at: "2026-09-28T06:00:00+00:00",
      story_articles: [
        {
          articles: {
            id: 21,
            canonical_url: "https://example.com/b",
            published_at: "2026-09-28T06:00:00+00:00",
            language: "hi",
            sources: { name: "Example", domain: "example.com" },
          },
        },
        {
          articles: {
            id: 20,
            canonical_url: "https://example.com/a",
            published_at: "2026-09-28T04:30:00+00:00",
            language: "en",
            sources: { name: "Example", domain: "example.com" },
          },
        },
        { articles: null },
      ],
    });
    expect(detail.id).toBe("7"); // route-param form
    expect(detail.demo).toBe(false);
    expect(detail.districtNames).toEqual(["Patna"]);
    expect(detail.languages).toEqual(["EN", "HI"]);
    expect(detail.reports.map((r) => r.url)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
    expect(detail.reports.map((r) => r.publishedAt)).toEqual([
      "2026-09-28T04:30:00+00:00",
      "2026-09-28T06:00:00+00:00",
    ]);
    expect(detail.entities).toEqual([]); // filled by the live entity fetch
  });

  it("sortReports puts unknown times last", () => {
    const sorted = sortReports([
      { sourceName: "Unknown", publishedAt: null, url: null },
      {
        sourceName: "Ten",
        publishedAt: "2026-09-28T10:00:00+00:00",
        url: null,
      },
      {
        sourceName: "Six",
        publishedAt: "2026-09-28T06:00:00+00:00",
        url: null,
      },
    ]);
    expect(sorted.map((r) => r.sourceName)).toEqual([
      "Six", // 06:00 — oldest first
      "Ten", // 10:00
      "Unknown", // unknown time last
    ]);
  });

  it("formatStamp renders Bihar time regardless of input offset", () => {
    expect(formatStamp("2026-09-28T10:00:00+05:30")).toBe("28 Sep, 10:00");
    expect(formatStamp("2026-09-28T04:30:00+00:00")).toBe("28 Sep, 10:00"); // UTC → IST
    expect(formatStamp("2026-10-28T10:00:00+05:30")).toBe("28 Oct, 10:00");
    expect(formatStamp(null)).toBeNull();
    expect(formatStamp("not-a-date")).toBeNull();
  });
});
