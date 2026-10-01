// Source archive reads (Phase 32): the plan's public source page over real
// coverage data —
//
// - Latest articles: newest reports by this source (the reviewed fixture
//   corpus in demo, `articles.source_id` live).
// - Recent stories: stories with at least one article by this source (demo
//   derives them from the fixture corpus).
// - Recent Bihar coverage: distinct stories/districts over the sampled
//   articles, every count carrying its sample size — never decorative
//   totals (plan: no empty decorative statistics).
//
// Registry facts (name/language/scope/type) are static and render even
// without a database; only coverage depends on data availability. Crawler
// diagnostics never cross into this module (admin-only, plan rule).
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";
import { DEMO_ARTICLES, type DemoArticle } from "./demo-articles";
import { DEMO_STORIES } from "./demo-stories";
import { demoPublisher } from "./demo-story-details";
import { STORY_SELECT, toPublicStory, type StoryRow } from "./feed";
import { getSourceBySlug, type PublicSource } from "./sources";
import type { PublicStory } from "./types";

export interface SourceArticle {
  headline: string;
  publishedAt: string | null;
  /** Original publisher link; null when genuinely unknown (demo fixture). */
  url: string | null;
  /** District slugs resolving to real geography — linked on the page. */
  districts: string[];
}

export interface CoverageCounts {
  /** Articles in the sample. */
  articles: number;
  /** Distinct stories among those articles. */
  stories: number;
  /** Distinct districts among those articles. */
  districts: number;
  /** Sample size behind every count above (project rule). */
  sample: number;
}

export interface SourcePageData {
  source: PublicSource;
  /** Live database reachable (demo needs no database). */
  configured: boolean;
  demo: boolean;
  error: string | null;
  /** Newest first, capped for display. */
  articles: SourceArticle[];
  /** Newest activity first, capped for display. */
  stories: PublicStory[];
  /** Counts over the full sample (not the capped lists); null when the
   *  sample is empty — the page then renders an honest empty state. */
  coverage: CoverageCounts | null;
}

const ARTICLE_LIMIT = 12;
const STORY_LIMIT = 12;
const SAMPLE_LIMIT = 100;

interface SourceArticleRow {
  headline: string;
  canonical_url: string;
  published_at: string | null;
  district_id: string | null;
  story_id: number | null;
}

/** Newest first; ISO timestamps share one offset, so string order is time order. */
function byPublishedDesc(
  a: { publishedAt: string | null },
  b: { publishedAt: string | null }
): number {
  const left = a.publishedAt ?? "";
  const right = b.publishedAt ?? "";
  return left < right ? 1 : left > right ? -1 : 0;
}

function byLastSeenDesc(a: PublicStory, b: PublicStory): number {
  if (a.lastSeenAt < b.lastSeenAt) return 1;
  if (a.lastSeenAt > b.lastSeenAt) return -1;
  return 0;
}

/** Fixture article → display row. The fixture carries no article URLs —
 *  `url` stays null rather than pointing at a guessed page. */
function toDemoArticle(article: DemoArticle): SourceArticle {
  return {
    headline: article.headline,
    publishedAt: article.publishedAt,
    url: null,
    districts: article.districts,
  };
}

function demoSourceData(source: PublicSource, configured: boolean): SourcePageData {
  // Articles whose resolved publisher name matches this registry source —
  // fixture slugs map through demoPublisher (e.g. toi → "Times of India
  // Patna"), so no fixture-only source can leak onto a registry page.
  const articles = DEMO_ARTICLES.filter((a) => demoPublisher(a.source).name === source.name).sort(
    byPublishedDesc
  );
  // Stories featuring this source: the fixture group, or the article id for
  // singletons (which doubles as the demo story id).
  const storyIds = [...new Set(articles.map((a) => a.story ?? a.id))];
  const stories = DEMO_STORIES.filter((s) => storyIds.includes(String(s.id)))
    .sort(byLastSeenDesc)
    .slice(0, STORY_LIMIT);
  const districtSlugs = new Set(articles.flatMap((a) => a.districts));

  return {
    source,
    configured,
    demo: true,
    error: null,
    articles: articles.slice(0, ARTICLE_LIMIT).map(toDemoArticle),
    stories,
    coverage:
      articles.length === 0
        ? null
        : {
            articles: articles.length,
            stories: storyIds.length,
            districts: districtSlugs.size,
            // The whole fixture corpus is the demo sample window.
            sample: DEMO_ARTICLES.length,
          },
  };
}

function emptySourceData(
  source: PublicSource,
  overrides: Partial<SourcePageData> = {}
): SourcePageData {
  return {
    source,
    configured: false,
    demo: false,
    error: null,
    articles: [],
    stories: [],
    coverage: null,
    ...overrides,
  };
}

/** One source's archive data; null when the slug is not an active registry
 *  source (the page then 404s regardless of database state — the plan's
 *  "stable public page" is registry-driven, not database-driven). */
export async function getSource(
  slug: string,
  options: { demo?: boolean } = {}
): Promise<SourcePageData | null> {
  const source = getSourceBySlug(slug);
  if (!source) return null;
  if (options.demo) return demoSourceData(source, isSupabaseConfigured());

  const client = getSupabaseClient();
  if (!client) return emptySourceData(source);

  try {
    // Latest articles for this source. Registry names are unique in the DB
    // (the seed writes the same registry.json rows), so the inner join on
    // the to-one FK filters by source without resolving an id first.
    const articlesResult = await client
      .from("articles")
      .select("headline,canonical_url,published_at,district_id,story_id,sources!inner(name)")
      .eq("sources.name", source.name)
      .order("published_at", { ascending: false })
      .limit(SAMPLE_LIMIT);
    if (articlesResult.error) throw articlesResult.error;
    const rows = (articlesResult.data ?? []) as unknown as SourceArticleRow[];

    // Stories featuring this source, newest activity first.
    const storyIds = [
      ...new Set(rows.map((r) => r.story_id).filter((id): id is number => id !== null)),
    ];
    let stories: PublicStory[] = [];
    if (storyIds.length > 0) {
      const storiesResult = await client
        .from("stories")
        .select(STORY_SELECT)
        .in("id", storyIds)
        .order("last_seen_at", { ascending: false })
        .limit(STORY_LIMIT);
      if (storiesResult.error) throw storiesResult.error;
      stories = ((storiesResult.data ?? []) as unknown as StoryRow[]).map(toPublicStory);
    }

    return {
      source,
      configured: true,
      demo: false,
      error: null,
      articles: rows.slice(0, ARTICLE_LIMIT).map((row) => ({
        headline: row.headline,
        publishedAt: row.published_at,
        url: row.canonical_url,
        districts: row.district_id ? [row.district_id] : [],
      })),
      stories,
      coverage:
        rows.length === 0
          ? null
          : {
              articles: rows.length,
              stories: storyIds.length,
              districts: new Set(
                rows.map((r) => r.district_id).filter((id): id is string => id !== null)
              ).size,
              sample: rows.length,
            },
    };
  } catch (error) {
    return emptySourceData(source, {
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
