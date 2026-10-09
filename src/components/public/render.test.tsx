// Phase 28 completion gate — part 2: the public site renders the V1 visual
// system (header, pill strip, glass-card grid) over the V2 story architecture,
// and none of the removed V1 features (login, logout, session checks, avatar,
// sentiment buttons, recommendation prediction, block-phrase controls) appear.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CategoryTabs from "./CategoryTabs";
import Header from "./Header";
import Newsfeed from "./Newsfeed";
import StoryCard from "./StoryCard";
import Home from "@/app/(public)/page";
import {
  generateMetadata as generateDistrictMetadata,
  default as DistrictPage,
} from "@/app/(public)/district/[slug]/page";
import DistrictIndex from "@/app/(public)/district/page";
import {
  generateMetadata as generateSourceMetadata,
  default as SourcePage,
} from "@/app/(public)/source/[slug]/page";
import SourceIndex from "@/app/(public)/source/page";
import { SOURCES } from "@/lib/public/sources";
import {
  generateMetadata as generateArchiveMetadata,
  default as ArchivePage,
} from "@/app/(public)/archive/page";
import {
  generateMetadata as generateSearchMetadata,
  default as SearchPage,
} from "@/app/(public)/search/page";
import { generateMetadata, default as StoryPage } from "@/app/(public)/story/[id]/page";
import { DEMO_STORIES } from "@/lib/public/demo-stories";

const FORBIDDEN =
  /sign[\s-]?in|log[\s-]?in|log[\s-]?out|avatar|sentiment|block[\s-]?phrase|recommend/i;

describe("Phase 28 — public shell", () => {
  it("header carries the V1 identity and only the allowed controls", () => {
    const html = renderToStaticMarkup(<Header totalStories={12} />);
    expect(html).toContain("PrōjectBihar Newsfeed");
    expect(html).toContain("glass-header sticky top-0 z-50");
    expect(html).toContain(">12<");
    expect(html).toContain('aria-label="Toggle dark mode"');
    expect(html).toContain('aria-label="Refresh stories"');
    expect(html).toContain("Refresh");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("category pill strip renders All + the eight V2 categories, V1 styling", () => {
    const html = renderToStaticMarkup(<CategoryTabs active="all" onChange={() => {}} />);
    for (const label of [
      "All",
      "Economy",
      "Infrastructure",
      "Industry",
      "Agriculture",
      "Education",
      "Healthcare",
      "Environment",
      "Governance",
    ]) {
      expect(html).toContain(`>${label}<`);
    }
    // Active pill uses the V1 accent-background treatment.
    expect(html).toContain("bg-[var(--accent)] text-white");
    expect(html).toContain("scrollbar-hide");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("story card renders the V2 story shape inside the V1 card", () => {
    const metro = DEMO_STORIES.find((s) => s.id === "metro-approval");
    expect(metro).toBeDefined();
    const html = renderToStaticMarkup(<StoryCard story={metro!} />);
    expect(html).toContain("glass-card p-4 sm:p-5");
    expect(html).toContain("Cabinet approves Patna Metro expansion");
    expect(html).toContain("Infrastructure");
    expect(html).toContain("#dc2626"); // V1 infrastructure pill colour
    expect(html).toContain("Patna · ");
    expect(html).toContain("5 sources");
    expect(html).toContain("EN + HI");
    expect(html).toMatch(/ago|yesterday|just now/);
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("uncategorised stories render without a badge", () => {
    const rally = DEMO_STORIES.find((s) => s.id === "s-rally");
    expect(rally).toBeDefined();
    const html = renderToStaticMarkup(<StoryCard story={rally!} />);
    expect(html).toContain("Minister attacks rival at Muzaffarpur rally");
    expect(html).toContain("Muzaffarpur");
    expect(html).not.toContain("uppercase tracking-wider");
    expect(html).not.toContain("background-color");
    expect(html).toContain("1 source · HI"); // singular, with language
  });

  it("feed shell lays out header, container, nav, modes, and 3-column grid like V1", () => {
    const html = renderToStaticMarkup(<Newsfeed stories={DEMO_STORIES} />);
    expect(html).toContain("max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-[105px] py-3 sm:py-4");
    expect(html).toContain(
      "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-2 items-stretch"
    );
    expect(html).toContain("animate-fade-in h-full");
    const curatedCount = DEMO_STORIES.filter((s) => s.curated).length;
    expect((html.match(/glass-card p-4/g) ?? []).length).toBe(curatedCount);
    expect(html).toContain(`>${curatedCount}<`); // V1 "total" count follows the view
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("homepage serves the reviewed fixture stories behind a demo notice", async () => {
    const page = await Home({ searchParams: Promise.resolve({ demo: "1" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Demo stories");
    expect(html).toContain("Phase 16 clustering benchmark");
    expect(html).toContain("Cabinet approves Patna Metro expansion");
    expect(html).toContain("शिक्षक नियुक्ति परीक्षा कैलेंडर जारी");
    expect(html).toContain("Tenders invited for metro corridor works");
    // Default Curated view: 9 of the 12 fixture stories; routine crime etc.
    // stay behind the "All Bihar News" mode.
    expect((html.match(/glass-card p-4/g) ?? []).length).toBe(9);
    expect(html).not.toContain("Three arrested after Patna robbery");
    expect(html).toContain(">All Bihar News<");
    expect(html).toContain("(12)");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("homepage degrades honestly when no database is configured", async () => {
    const page = await Home({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Supabase is not configured");
    expect(html).toContain("No stories found");
    expect(html).toContain("Check back after the next crawl cycle.");
    expect(html).toContain(">0<");
    expect(html).not.toMatch(FORBIDDEN);
  });
});

describe("Phase 29 — homepage feed modes and navigation", () => {
  it("renders the plan's section nav: all five routes live, none disabled", () => {
    const html = renderToStaticMarkup(<Newsfeed stories={DEMO_STORIES} demo />);
    expect(html).toContain('aria-label="Sections"');
    expect(html).toContain('href="/?demo=1"'); // Latest stays in the demo view
    expect(html).toContain('aria-current="page"'); // Latest is home
    expect(html).toContain('href="#topics"'); // Topics anchors the pill strip
    expect(html).toContain('href="/district?demo=1"'); // Phase 31: district index
    expect(html).toContain('href="/source?demo=1"'); // Phase 32: source index
    expect(html).toContain('href="/archive?demo=1"'); // Phase 33: archive
    // The plan IA is fully implemented — no disabled placeholders remain.
    expect(html).not.toContain('aria-disabled="true"');
    expect(html).not.toMatch(FORBIDDEN);
    // Live mode: plain routes, no demo flag anywhere.
    const live = renderToStaticMarkup(<Newsfeed stories={[]} />);
    expect(live).toContain('href="/"');
    expect(live).toContain('href="/district"');
    expect(live).toContain('href="/source"');
    expect(live).toContain('href="/archive"');
    expect(live).not.toContain("demo=1");
    expect(live).not.toMatch(FORBIDDEN);
  });

  it("defaults to Curated with both mode labels, counts, and exactly one pressed", () => {
    const html = renderToStaticMarkup(<Newsfeed stories={DEMO_STORIES} />);
    expect(html).toContain(">Curated<");
    expect(html).toContain(">All Bihar News<");
    expect(html).toContain("(9)"); // curated count
    expect(html).toContain("(12)"); // all count
    const pressed = html.match(/aria-pressed="true"/g) ?? [];
    expect(pressed).toHaveLength(1);
    // Curated default view: crime/politics/sport fixtures are not rendered.
    expect((html.match(/glass-card p-4/g) ?? []).length).toBe(9);
    expect(html).not.toContain("Three arrested after Patna robbery");
    expect(html).not.toContain("Minister attacks rival at Muzaffarpur rally");
    expect(html).toContain("Cabinet approves Patna Metro expansion");
    // Category pills live in Curated mode (V1 behaviour).
    expect(html).toContain('id="topics"');
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("story card carries no needless synopsis prose", () => {
    const html = renderToStaticMarkup(<StoryCard story={DEMO_STORIES[0]} />);
    expect(html).not.toContain("<p"); // headline + meta rows only
    expect(html).not.toMatch(FORBIDDEN);
  });
});

describe("Phase 30 — story page", () => {
  const storyProps = (id: string, demo?: string) => ({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(demo === undefined ? {} : { demo }) as Promise<
      Record<string, string | string[] | undefined>
    >,
  });

  it("represents the clustered development: facts, reports, entities", async () => {
    const page = await StoryPage(storyProps("metro-approval", "1"));
    const html = renderToStaticMarkup(page);

    // The plan's eight facts
    expect(html).toContain("Cabinet approves Patna Metro expansion");
    expect(html).toContain("Infrastructure");
    expect(html).toContain(">Approval<"); // event type, display form
    expect(html).toContain("First reported");
    expect(html).toContain("28 Sep, 10:00");
    expect(html).toContain("Latest update");
    expect(html).toContain("Patna"); // location
    expect(html).toContain("5 sources");
    expect(html).toContain("EN + HI");

    // Reports: five provenance rows, publishers linked out, oldest first
    expect(html).toContain(">Reports<");
    const order = [
      "The Hindu",
      "Indian Express",
      "Dainik Jagran",
      "Prabhat Khabar",
      "Dainik Bhaskar Bihar",
    ];
    let cursor = -1;
    for (const source of order) {
      const at = html.indexOf(`>${source}<`);
      expect(at, `${source} present`).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(html).toContain('href="https://thehindu.com"');
    expect(html).toContain('href="https://jagran.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');

    // Entities
    expect(html).toContain(">Entities<");
    for (const entity of ["Bihar Cabinet", "Patna Metro", "Bihta", "Patna"]) {
      expect(html).toContain(`>${entity}<`);
    }

    // Provenance only — never republish the article body
    expect(html).not.toContain("revised detailed project report");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("carries the demo notice and a way back to the feed", async () => {
    const page = await StoryPage(storyProps("s-gdp", "1"));
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Demo stories");
    expect(html).toContain('href="/?demo=1"'); // ← Latest, still in demo
    // Unregistered fixture source: named honestly, never linked to a guess.
    expect(html).toContain(">Business Standard<");
    expect(html).not.toContain("business-standard.com");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("404s unknown stories and live ids without a database", async () => {
    await expect(StoryPage(storyProps("nope", "1"))).rejects.toThrow();
    await expect(StoryPage(storyProps("1"))).rejects.toThrow();
  });

  it("homepage headlines link to the story page carrying the demo flag", async () => {
    const page = await Home({ searchParams: Promise.resolve({ demo: "1" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('href="/story/metro-approval?demo=1"');
    expect(html).toContain('href="/story/s-gdp?demo=1"');
  });

  it("metadata carries the canonical headline and source facts", async () => {
    const meta = await generateMetadata(storyProps("metro-approval", "1"));
    expect(meta.title).toBe("Cabinet approves Patna Metro expansion — PrōjectBihar Newsfeed");
    expect(String(meta.description)).toContain("5 sources");
  });
});

describe("Phase 31 — district pages", () => {
  const districtProps = (slug: string, demo?: string) => ({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(demo === undefined ? {} : { demo }) as Promise<
      Record<string, string | string[] | undefined>
    >,
  });

  it("patna archive: developments, stories, distribution, coverage from real geography", async () => {
    const page = await DistrictPage(districtProps("patna", "1"));
    const html = renderToStaticMarkup(page);

    expect(html).toContain(">Patna</h1>");
    expect(html).toContain("Latest developments");
    expect(html).toContain("Recent stories");
    expect(html).toContain("Topic distribution");
    expect(html).toContain("Source coverage");
    // Sample sizes attached to both metrics.
    expect(html).toContain("Across 5 recent stories");
    expect(html).toContain("Across 9 recent articles");

    // Developments: newest report first (s-tender is dated 28 Oct in the
    // fixture; s-cag is the oldest).
    const newest = html.indexOf("Tenders invited for metro corridor works");
    const oldest = html.indexOf("CAG flags road scheme irregularities");
    expect(newest).toBeGreaterThan(-1);
    expect(oldest).toBeGreaterThan(newest);
    // Demo headlines stay unlinked — the fixture carries no article URLs.
    expect(html).not.toContain('target="_blank"');

    // Story cards: this district's stories, demo flag carried.
    expect(html).toContain('href="/story/metro-approval?demo=1"');
    expect(html).toContain('href="/story/s-tender?demo=1"');
    expect(html).not.toContain('href="/story/flood-relief');
    expect(html).not.toContain('href="/story/s-rally');

    // Counts, coverage rows, and the way back to the index.
    expect(html).toContain("Infrastructure"); // topic distribution label
    expect(html).toContain("Dainik Jagran"); // source coverage row
    expect(html).toContain('href="/district?demo=1"'); // ← All districts
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("the flood story appears on both Supaul and Saharsa archives", async () => {
    for (const slug of ["supaul", "saharsa"]) {
      const html = renderToStaticMarkup(await DistrictPage(districtProps(slug, "1")));
      expect(html, slug).toContain('href="/story/flood-relief?demo=1"');
      expect(html, slug).toContain("Relief camps house 40,000 in north Bihar");
      expect(html, slug).toContain("Across 1 recent story");
      expect(html, slug).toContain("Across 3 recent articles");
      expect(html, slug).not.toMatch(FORBIDDEN);
    }
  });

  it("an empty district shows an honest empty state and no statistics", async () => {
    const html = renderToStaticMarkup(await DistrictPage(districtProps("jamui", "1")));
    expect(html).toContain("No coverage recorded for Jamui yet.");
    expect(html).not.toContain("Topic distribution");
    expect(html).not.toContain("Source coverage");
    expect(html).not.toContain("Latest developments");
    expect(html).not.toContain("Recent stories");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("404s unknown districts", async () => {
    await expect(DistrictPage(districtProps("nowhere", "1"))).rejects.toThrow();
  });

  it("the index links all 38 districts, demo flag carried", async () => {
    const html = renderToStaticMarkup(
      await DistrictIndex({ searchParams: Promise.resolve({ demo: "1" }) })
    );
    expect(html).toContain(">Districts</h1>");
    expect(html).toContain("All 38 Bihar districts");
    expect(html).toContain('href="/district/patna?demo=1"');
    expect(html).toContain('href="/district/jamui?demo=1"');
    const links = html.match(/href="\/district\/[a-z-]+(\?demo=1)?"/g) ?? [];
    expect(links).toHaveLength(38);
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("story Location links into the district archive", async () => {
    const html = renderToStaticMarkup(
      await StoryPage({
        params: Promise.resolve({ id: "metro-approval" }),
        searchParams: Promise.resolve({ demo: "1" }),
      })
    );
    expect(html).toContain('href="/district/patna?demo=1"');
  });

  it("district metadata names the archive", async () => {
    const meta = await generateDistrictMetadata(districtProps("patna", "1"));
    expect(meta.title).toBe("Patna district — PrōjectBihar Newsfeed");
    expect(String(meta.description)).toContain("Patna district");
  });
});

describe("Phase 32 — source pages", () => {
  const sourceProps = (slug: string, demo?: string) => ({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(demo === undefined ? {} : { demo }) as Promise<
      Record<string, string | string[] | undefined>
    >,
  });

  it("the-hindu: plan fields, coverage with sample, articles, stories", async () => {
    const html = renderToStaticMarkup(await SourcePage(sourceProps("the-hindu", "1")));
    expect(html).toContain("Demo stories"); // fixture view, honestly labeled

    // Source header: name links to the registry-verified homepage.
    expect(html).toContain(">Source archive<");
    expect(html).toContain(">The Hindu</a>");
    expect(html).toContain('href="https://thehindu.com"');
    expect(html).toContain('rel="noopener noreferrer"');

    // The plan's public fields.
    expect(html).toContain(">Language<");
    expect(html).toContain(">EN<");
    expect(html).toContain(">Scope<");
    expect(html).toContain(">national<");
    expect(html).toContain(">Source type<");
    expect(html).toContain(">news<");

    // Recent Bihar coverage with its sample size attached (3/3/3 for The
    // Hindu: three fixture reports across three stories and three districts).
    expect(html).toContain(">Recent Bihar coverage<");
    expect(html).toContain("Across the 21-article fixture corpus");
    expect(html.match(/>3<\/div>/g) ?? []).toHaveLength(3);
    expect(html).toContain(">articles<");
    expect(html).toContain(">stories<");
    expect(html).toContain(">districts<");

    // Latest articles: newest first; fixture rows are unlinked spans (the
    // corpus carries no article URLs — exactly three plain rows); stamps in
    // Bihar time; districts link into the district archives.
    expect(html).toContain(">Latest articles<");
    const first = html.indexOf("Cabinet approves Patna Metro expansion");
    const second = html.indexOf("Relief camps house 40,000 in north Bihar");
    const third = html.indexOf("CAG flags road scheme irregularities");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(html.match(/class="block text-\[13\.5px\] font-medium"/g) ?? []).toHaveLength(3);
    expect(html).toContain("28 Sep, 10:00");
    expect(html).toContain('href="/district/patna?demo=1"');
    expect(html).toContain('href="/district/supaul?demo=1"');
    expect(html).toContain('href="/district/saharsa?demo=1"');

    // Recent stories with the demo flag; back link stays in the demo view.
    expect(html).toContain(">Recent stories<");
    expect(html).toContain('href="/story/metro-approval?demo=1"');
    expect(html).toContain('href="/story/flood-relief?demo=1"');
    expect(html).toContain('href="/story/s-cag?demo=1"');
    expect(html).toContain('href="/source?demo=1"'); // ← All sources

    // Provenance only: the homepage is the single external link — no crawler
    // endpoint URL ever renders publicly.
    const external = html.match(/href="https:\/\/[^"]*"/g) ?? [];
    expect(external).toEqual(['href="https://thehindu.com"']);
    expect(html).not.toContain("feeder/default.rss");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("an active source without coverage shows an honest empty state, no stats", async () => {
    const html = renderToStaticMarkup(await SourcePage(sourceProps("mongabay-india", "1")));
    expect(html).toContain("No coverage recorded for Mongabay India yet.");
    expect(html).toContain(">Mongabay India</a>"); // registry facts still render
    expect(html).not.toContain("Recent Bihar coverage");
    expect(html).not.toContain("Latest articles");
    expect(html).not.toContain("Recent stories");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("live source page: registry facts with an honest no-database notice", async () => {
    const html = renderToStaticMarkup(await SourcePage(sourceProps("the-hindu")));
    expect(html).toContain("Supabase is not configured");
    expect(html).toContain(">The Hindu</a>");
    expect(html).toContain(">national<");
    // No data → no statistics, and no fabricated empty-state claim either.
    expect(html).not.toContain("Recent Bihar coverage");
    expect(html).not.toContain("Latest articles");
    expect(html).not.toContain("Recent stories");
    expect(html).not.toContain("No coverage recorded");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("404s unknown, inactive, and internal fixture slugs", async () => {
    await expect(SourcePage(sourceProps("nope", "1"))).rejects.toThrow();
    await expect(SourcePage(sourceProps("news18-bihar", "1"))).rejects.toThrow();
    await expect(SourcePage(sourceProps("press-information-bureau", "1"))).rejects.toThrow();
    await expect(SourcePage(sourceProps("toi", "1"))).rejects.toThrow();
    await expect(SourcePage(sourceProps("nope"))).rejects.toThrow();
  });

  it("the index links every active source, demo flag carried", async () => {
    const html = renderToStaticMarkup(
      await SourceIndex({ searchParams: Promise.resolve({ demo: "1" }) })
    );
    expect(html).toContain(">Sources</h1>");
    expect(html).toContain(`All ${SOURCES.length} active sources`);
    expect(html).toContain('href="/source/the-hindu?demo=1"');
    expect(html).toContain('href="/source/times-of-india-patna?demo=1"');
    expect(html).toContain('href="/source/prs-legislative-research?demo=1"');
    const links = html.match(/href="\/source\/[a-z0-9-]+(\?demo=1)?"/g) ?? [];
    expect(links).toHaveLength(SOURCES.length);
    // Inactive registry entries are not listed.
    expect(html).not.toContain("News18 Bihar");
    expect(html).not.toContain("Press Information Bureau");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("district source-coverage rows link into the source archives", async () => {
    const html = renderToStaticMarkup(
      await DistrictPage({
        params: Promise.resolve({ slug: "patna" }),
        searchParams: Promise.resolve({ demo: "1" }),
      })
    );
    expect(html).toContain('href="/source/dainik-jagran?demo=1"');
    expect(html).toContain('href="/source/the-hindu?demo=1"');
    expect(html).toContain('href="/source/times-of-india-patna?demo=1"');
    expect(html).toContain('href="/source/economic-times?demo=1"');
    // All seven sources in Patna's sample are registry-active — seven links.
    const links = html.match(/href="\/source\/[a-z0-9-]+(\?demo=1)?"/g) ?? [];
    expect(links).toHaveLength(7);
  });

  it("source metadata names the source", async () => {
    const meta = await generateSourceMetadata(sourceProps("the-hindu", "1"));
    expect(meta.title).toBe("The Hindu — PrōjectBihar Newsfeed");
    expect(String(meta.description)).toContain("The Hindu");
    const missing = await generateSourceMetadata(sourceProps("nope"));
    expect(missing.title).toBe("Source not found — PrōjectBihar Newsfeed");
  });
});

describe("Phase 33 — archive page", () => {
  const archiveProps = (query: Record<string, string> = {}) => ({
    searchParams: Promise.resolve(query) as Promise<Record<string, string | string[] | undefined>>,
  });

  it("page 1 renders one window of the fixture with real totals", async () => {
    const html = renderToStaticMarkup(await ArchivePage(archiveProps({ demo: "1" })));
    expect(html).toContain(">Archive</h1>");
    expect(html).toContain("Demo stories");
    // 12 stories in the archive, 8 on this page — never loaded whole.
    expect(html).toContain("12 stories");
    expect(html.match(/<article /g) ?? []).toHaveLength(8);
    // Newest first within the window: tender (Oct) … bridge-collapse.
    const first = html.indexOf("Tenders invited for metro corridor works");
    const last = html.indexOf("Bridge collapses a year after construction");
    expect(first).toBeGreaterThan(-1);
    expect(last).toBeGreaterThan(first);
    expect(html).not.toContain("State GDP growth pegged at 9.2 percent"); // page 2

    // Server-side pagination as plain links, demo flag preserved
    // (renderToStaticMarkup escapes & as &amp; in attributes).
    expect(html).toContain("Page 1 of 2");
    expect(html).toContain('href="/archive?page=2&amp;demo=1"');
    expect(html).not.toContain("page=1"); // page 1 never carries a page param
    expect(html).toContain('href="/story/s-tender?demo=1"');

    // Date filter form: required year, month options, demo preserved.
    expect(html).toContain('name="year"');
    expect(html).toContain('type="hidden" name="demo" value="1"');
    expect(html).toContain(">September</option>");
    expect(html).not.toContain("Clear filter"); // no filter applied
    // Entry point to Phase 34 search, demo flag carried.
    expect(html).toContain('href="/search?demo=1"');
    expect(html).toContain("Search the archive");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("page 2 carries the tail of the window with a link back to page 1", async () => {
    const html = renderToStaticMarkup(await ArchivePage(archiveProps({ demo: "1", page: "2" })));
    expect(html.match(/<article /g) ?? []).toHaveLength(4);
    expect(html).toContain("State GDP growth pegged at 9.2 percent");
    expect(html).toContain("CAG flags road scheme irregularities");
    expect(html).not.toContain("Tenders invited for metro corridor works"); // page 1
    expect(html).toContain("Page 2 of 2");
    expect(html).toContain('href="/archive?demo=1"'); // ← Newer: back to page 1
    expect(html).not.toContain("page=3"); // no dead forward link
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("date filters narrow the window and survive every link", async () => {
    const html = renderToStaticMarkup(
      await ArchivePage(archiveProps({ demo: "1", year: "2026", month: "09" }))
    );
    // 11 of 12 stories in September 2026 (the tender story is October).
    expect(html).toContain("11 stories · September 2026");
    expect(html.match(/<article /g) ?? []).toHaveLength(8);
    expect(html).not.toContain("Tenders invited for metro corridor works");
    // Older link carries year+month+page+demo (& escaped in markup).
    expect(html).toContain('href="/archive?year=2026&amp;month=09&amp;page=2&amp;demo=1"');
    // Form state round-trips; Clear returns to the unfiltered archive.
    expect(html).toContain('value="2026"');
    expect(html).toContain('value="09"');
    expect(html).toContain("Clear filter");
    expect(html).toContain('href="/archive?demo=1"');
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("an empty year renders the honest empty state with a way back", async () => {
    const html = renderToStaticMarkup(await ArchivePage(archiveProps({ demo: "1", year: "2025" })));
    expect(html).toContain("No stories recorded for 2025 yet.");
    expect(html).toContain('href="/archive?demo=1"'); // Browse all months
    expect(html).not.toContain("<article ");
    expect(html).not.toContain('aria-label="Archive pages"'); // single empty page
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("404s malformed archive queries instead of guessing", async () => {
    await expect(ArchivePage(archiveProps({ year: "abc" }))).rejects.toThrow();
    await expect(ArchivePage(archiveProps({ year: "2026", month: "13" }))).rejects.toThrow();
    await expect(ArchivePage(archiveProps({ page: "0" }))).rejects.toThrow();
    await expect(ArchivePage(archiveProps({ month: "09" }))).rejects.toThrow();
  });

  it("live archive: honest no-database notice, no fabricated stories", async () => {
    const html = renderToStaticMarkup(await ArchivePage(archiveProps({ year: "2026" })));
    expect(html).toContain("Supabase is not configured");
    expect(html).toContain(">Archive</h1>");
    expect(html).toContain("0 stories");
    expect(html).not.toContain("<article ");
    expect(html).not.toContain("No stories recorded"); // notice-only, not a claim
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("archive metadata names the filter", async () => {
    const filtered = await generateArchiveMetadata(
      archiveProps({ year: "2026", month: "09", demo: "1" })
    );
    expect(filtered.title).toBe("Archive: September 2026 — PrōjectBihar Newsfeed");
    const plain = await generateArchiveMetadata(archiveProps({}));
    expect(plain.title).toBe("Archive — PrōjectBihar Newsfeed");
    const invalid = await generateArchiveMetadata(archiveProps({ year: "abc" }));
    expect(invalid.title).toBe("Archive not found — PrōjectBihar Newsfeed");
  });
});

describe("Phase 34 — search page", () => {
  const searchProps = (query: Record<string, string> = {}) => ({
    searchParams: Promise.resolve(query) as Promise<Record<string, string | string[] | undefined>>,
  });

  it("browse state: prompt over one server-paginated window, plan fields visible", async () => {
    const html = renderToStaticMarkup(await SearchPage(searchProps({ demo: "1" })));
    expect(html).toContain(">Search</h1>");
    expect(html).toContain("Demo stories");
    // Count line (12 fixture stories) plus the browse prompt — never a claim.
    expect(html).toContain("12 stories");
    expect(html).toContain(
      "Search story titles, article headlines, entities, districts, categories and"
    );
    expect(html).not.toContain("Headline matches rank first"); // no query yet
    expect(html).not.toContain("No stories match"); // not an empty state
    // One window only: 8 of 12 cards, server-paginated like /archive.
    expect(html.match(/<article /g) ?? []).toHaveLength(8);
    expect(html).toContain("Page 1 of 2");
    // The plan's whole query surface: q + the seven filters, GET round-trip.
    expect(html).toContain('action="/search"');
    expect(html).toContain('method="get"');
    for (const name of [
      "q",
      "district",
      "category",
      "type",
      "event",
      "source",
      "language",
      "year",
    ]) {
      expect(html).toContain(`name="${name}"`);
    }
    expect(html).toContain('type="hidden" name="demo" value="1"');
    expect(html).not.toContain(">Clear<"); // no criteria applied
    expect(html).toContain('href="/archive?demo=1"'); // way back to the archive
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("results: query summary, ranking note, ranked headline order, Clear round-trip", async () => {
    const html = renderToStaticMarkup(await SearchPage(searchProps({ demo: "1", q: "metro" })));
    expect(html).toContain("3 stories for «metro»");
    expect(html).toContain("Headline matches rank first, then newest");
    // Every "metro" story has it in the headline (tier 1), so first-seen
    // order decides: tender (Oct) → fares → cabinet approval.
    const tender = html.indexOf("Tenders invited for metro corridor works");
    const fares = html.indexOf("Metro fares announced for first corridor");
    const cabinet = html.indexOf("Cabinet approves Patna Metro expansion");
    expect(tender).toBeGreaterThan(-1);
    expect(fares).toBeGreaterThan(tender);
    expect(cabinet).toBeGreaterThan(fares);
    expect(html).not.toContain("State GDP growth pegged at 9.2 percent"); // non-match excluded
    // Query round-trips in the field; Clear drops criteria but keeps demo.
    expect(html).toContain('value="metro"');
    expect(html).toContain('href="/search?demo=1"');
    expect(html).toContain(">Clear<");
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("filters narrow results, summarize as labels, and survive pagination", async () => {
    const filtered = renderToStaticMarkup(
      await SearchPage(searchProps({ demo: "1", q: "metro", district: "patna" }))
    );
    expect(filtered).toContain("3 stories for «metro» · Patna");
    expect(filtered.match(/<article /g) ?? []).toHaveLength(3);
    // Select round-trips the applied district (React emits `selected`).
    expect(filtered).toMatch(
      /<option[^>]*selected[^>]*value="patna"|<option[^>]*value="patna"[^>]*selected/
    );
    // Year filter labels the summary; pagination keeps every criterion.
    const paged = renderToStaticMarkup(
      await SearchPage(searchProps({ demo: "1", q: "a", year: "2026" }))
    );
    expect(paged).toContain("12 stories for «a» · 2026");
    expect(paged).toContain('href="/search?q=a&amp;year=2026&amp;page=2&amp;demo=1"');
    expect(paged).toContain('value="2026"'); // year input round-trip
    const page2 = renderToStaticMarkup(
      await SearchPage(searchProps({ demo: "1", q: "a", year: "2026", page: "2" }))
    );
    expect(page2).toContain("Page 2 of 2");
    expect(page2).toContain('href="/search?q=a&amp;year=2026&amp;demo=1"'); // ← Previous
    expect(page2.match(/<article /g) ?? []).toHaveLength(4); // the rest of the window
  });

  it("an honest empty result explains itself, including the fixture gap", async () => {
    const noMatch = renderToStaticMarkup(
      await SearchPage(searchProps({ demo: "1", q: "zzz-nothing" }))
    );
    expect(noMatch).toContain("No stories match «zzz-nothing».");
    expect(noMatch).toContain("Try fewer words or clear a filter.");
    expect(noMatch).toContain("Clear search");
    expect(noMatch).toContain('href="/search?demo=1"');
    expect(noMatch).not.toContain("<article ");
    expect(noMatch).not.toContain("article-type labels"); // not this case
    // The fixture carries no article-type labels — stated, not faked.
    const typed = renderToStaticMarkup(
      await SearchPage(searchProps({ demo: "1", type: "development" }))
    );
    expect(typed).toContain("No stories match these filters.");
    expect(typed).toContain("The demo fixture carries no article-type labels");
    expect(typed).not.toContain("<article ");
  });

  it("404s unknown, inactive, or malformed filters instead of guessing", async () => {
    await expect(SearchPage(searchProps({ district: "nope" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ category: "nope" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ type: "nope" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ event: "nope" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ source: "nope" }))).rejects.toThrow();
    // Inactive registry sources are not live filters.
    await expect(SearchPage(searchProps({ source: "news18-bihar" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ language: "fr" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ year: "abc" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ page: "0" }))).rejects.toThrow();
    await expect(SearchPage(searchProps({ q: "x".repeat(101) }))).rejects.toThrow();
  });

  it("live search: honest no-database notice, no fabricated results", async () => {
    const html = renderToStaticMarkup(await SearchPage(searchProps({ q: "metro" })));
    expect(html).toContain("Supabase is not configured");
    expect(html).toContain(">Search</h1>");
    expect(html).toContain("0 stories for «metro»");
    expect(html).not.toContain("<article ");
    // Notice-only: the empty state is not asserted while unconfigured.
    expect(html).not.toContain("No stories match");
    expect(html).not.toContain('type="hidden" name="demo"'); // live form carries no demo flag
    expect(html).not.toMatch(FORBIDDEN);
  });

  it("search metadata carries the query, and 404 metadata says so", async () => {
    const withQuery = await generateSearchMetadata(searchProps({ q: "metro flood", demo: "1" }));
    expect(withQuery.title).toBe("Search: metro flood — PrōjectBihar Newsfeed");
    const plain = await generateSearchMetadata(searchProps({ demo: "1" }));
    expect(plain.title).toBe("Search — PrōjectBihar Newsfeed");
    const invalid = await generateSearchMetadata(searchProps({ district: "nope" }));
    expect(invalid.title).toBe("Search not found — PrōjectBihar Newsfeed");
  });
});
