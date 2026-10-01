// District archive reads (Phase 31): the plan's district page content over
// two real geography fields —
//
// - Recent stories: `stories.district_id` (story geography), newest activity first.
// - Latest developments + source coverage: `articles.district_id` (article
//   geography), newest reports first, coverage counted over the sampled set.
//
// Demo serves the reviewed fixture: stories filter on their district names,
// articles on their fixture district slugs. Every metric carries its sample
// size, and a district with no data produces empty sections rather than
// decorative statistics (plan: "Do not create empty decorative statistics").
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";
import { DEMO_ARTICLES } from "./demo-articles";
import { DEMO_STORIES } from "./demo-stories";
import { demoPublisher } from "./demo-story-details";
import { STORY_SELECT, toPublicStory, type StoryRow } from "./feed";
import { getDistrictBySlug, type District } from "./districts";
import type { PublicStory } from "./types";

export interface DistrictDevelopment {
  headline: string;
  sourceName: string;
  publishedAt: string | null;
  /** Original publisher link; null when genuinely unknown (demo fixture). */
  url: string | null;
}

export interface CountedName {
  name: string;
  count: number;
}

export interface TopicCount {
  /** primary_category value; null = stories filed without a category. */
  category: string | null;
  count: number;
}

export interface DistrictPageData {
  district: District;
  /** Live database reachable (demo needs no database). */
  configured: boolean;
  demo: boolean;
  error: string | null;
  stories: PublicStory[];
  developments: DistrictDevelopment[];
  /** Distinct sources over the sampled articles, most-covered first. */
  sourceCoverage: CountedName[];
  /** Category counts over `stories`, most frequent first (uncategorised last). */
  topicCounts: TopicCount[];
  /** Sample sizes behind the two distributions (project rule). */
  samples: { stories: number; articles: number };
}

const STORY_LIMIT = 60;
const DEVELOPMENT_LIMIT = 12;
const COVERAGE_LIMIT = 100;

interface DistrictArticleRow {
  headline: string;
  canonical_url: string;
  published_at: string | null;
  sources: { name: string; domain: string } | null;
}

function sortCoverage(counts: Map<string, number>): CountedName[] {
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function topicCountsOf(stories: PublicStory[]): TopicCount[] {
  const counts = new Map<string | null, number>();
  for (const story of stories) {
    counts.set(story.primaryCategory, (counts.get(story.primaryCategory) ?? 0) + 1);
  }
  const named = [...counts.entries()]
    .filter((entry): entry is [string, number] => entry[0] !== null)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => ({ category, count }));
  const uncategorised = counts.get(null) ?? 0;
  return uncategorised > 0 ? [...named, { category: null, count: uncategorised }] : named;
}

function demoDistrictData(district: District, configured: boolean): DistrictPageData {
  // Story geography: fixture stories carrying this district's canonical name,
  // newest activity first (mirrors the live `last_seen_at` order).
  const stories = DEMO_STORIES.filter((s) => s.districtNames.includes(district.name)).sort(
    (a, b) => (a.lastSeenAt < b.lastSeenAt ? 1 : a.lastSeenAt > b.lastSeenAt ? -1 : 0)
  );
  // Article geography: fixture articles carry district slugs, newest first.
  const articles = DEMO_ARTICLES.filter((a) => a.districts.includes(district.id)).sort((a, b) =>
    a.publishedAt < b.publishedAt ? 1 : -1
  );

  const coverage = new Map<string, number>();
  for (const article of articles) {
    const name = demoPublisher(article.source).name;
    coverage.set(name, (coverage.get(name) ?? 0) + 1);
  }

  return {
    district,
    configured,
    demo: true,
    error: null,
    stories,
    developments: articles.slice(0, DEVELOPMENT_LIMIT).map((article) => ({
      headline: article.headline,
      sourceName: demoPublisher(article.source).name,
      publishedAt: article.publishedAt,
      // The fixture carries no article URLs — headlines stay unlinked rather
      // than pointing at guessed pages.
      url: null,
    })),
    sourceCoverage: sortCoverage(coverage),
    topicCounts: topicCountsOf(stories),
    samples: { stories: stories.length, articles: articles.length },
  };
}

function emptyDistrictData(
  district: District,
  overrides: Partial<DistrictPageData> = {}
): DistrictPageData {
  return {
    district,
    configured: false,
    demo: false,
    error: null,
    stories: [],
    developments: [],
    sourceCoverage: [],
    topicCounts: [],
    samples: { stories: 0, articles: 0 },
    ...overrides,
  };
}

/** One district's archive data; null when the slug is not real geography
 *  (the page then 404s regardless of configuration). */
export async function getDistrict(
  slug: string,
  options: { demo?: boolean } = {}
): Promise<DistrictPageData | null> {
  const district = getDistrictBySlug(slug);
  if (!district) return null;
  if (options.demo) return demoDistrictData(district, isSupabaseConfigured());

  const client = getSupabaseClient();
  if (!client) return emptyDistrictData(district);

  try {
    const [storiesResult, articlesResult] = await Promise.all([
      // Story geography.
      client
        .from("stories")
        .select(STORY_SELECT)
        .eq("district_id", district.id)
        .order("last_seen_at", { ascending: false })
        .limit(STORY_LIMIT),
      // Article geography — one sample feeds developments and coverage.
      client
        .from("articles")
        .select("headline,canonical_url,published_at,sources(name,domain)")
        .eq("district_id", district.id)
        .order("published_at", { ascending: false })
        .limit(COVERAGE_LIMIT),
    ]);
    if (storiesResult.error) throw storiesResult.error;
    if (articlesResult.error) throw articlesResult.error;

    // Runtime shape pinned manually: supabase-js infers nested to-one
    // embeds as arrays without generated DB types; PostgREST returns objects.
    const stories = ((storiesResult.data ?? []) as unknown as StoryRow[]).map(toPublicStory);
    const articles = (articlesResult.data ?? []) as unknown as DistrictArticleRow[];

    const coverage = new Map<string, number>();
    for (const article of articles) {
      const name = article.sources?.name ?? "Unknown source";
      coverage.set(name, (coverage.get(name) ?? 0) + 1);
    }

    return {
      district,
      configured: true,
      demo: false,
      error: null,
      stories,
      developments: articles.slice(0, DEVELOPMENT_LIMIT).map((article) => ({
        headline: article.headline,
        sourceName: article.sources?.name ?? "Unknown source",
        publishedAt: article.published_at,
        url: article.canonical_url,
      })),
      sourceCoverage: sortCoverage(coverage),
      topicCounts: topicCountsOf(stories),
      samples: { stories: stories.length, articles: articles.length },
    };
  } catch (error) {
    return emptyDistrictData(district, {
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
