// Public feed reads (Phase 28/29). The live path reads the `stories` table
// when Supabase is configured; otherwise it returns an honest empty result and
// the page says so. `?demo=1` serves the reviewed Phase 16 fixture stories.
// Member articles provide two reader-facing facts: `curated` (plan §54: tier
// A + selected B — a story joins the default Curated feed when at least one
// member article was curated) and `language` (the card's `EN + HI` coverage).
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";
import districtsData from "../../../data/geography/districts.json";
import { DEMO_STORIES } from "./demo-stories";
import type { PublicStory } from "./types";

export interface FeedResult {
  stories: PublicStory[];
  configured: boolean;
  demo: boolean;
  error: string | null;
}

export const STORY_COLUMNS =
  "id,canonical_title,primary_category,event_type,district_id,article_count,source_count,first_seen_at,last_seen_at";

export const STORY_SELECT = `${STORY_COLUMNS},story_articles(articles(curated,language))`;

const DISTRICT_NAMES = new Map<string, string>(
  (
    districtsData as {
      entities: Array<{ id: string; canonical_name: string }>;
    }
  ).entities.map((e) => [e.id, e.canonical_name])
);

export interface StoryRow {
  id: number;
  canonical_title: string;
  primary_category: string | null;
  event_type: string | null;
  district_id: string | null;
  article_count: number;
  source_count: number;
  first_seen_at: string;
  last_seen_at: string;
  story_articles?: Array<{
    articles: { curated: boolean; language: string | null } | null;
  }> | null;
}

/** District slug → canonical display name (shared with the story page). */
export function districtNames(districtId: string | null): string[] {
  if (!districtId) return [];
  const canonical = DISTRICT_NAMES.get(districtId);
  return canonical ? [canonical] : [];
}

/** Exported for unit tests: the DB row → reader story mapping — the
 * any-member-curated aggregation the Curated mode reads, plus the
 * member-article language coverage shown on the card (`EN + HI`). */
export function toPublicStory(row: StoryRow): PublicStory {
  const members = row.story_articles ?? [];
  const languages = Array.from(
    new Set(
      members
        .map((m) => m.articles?.language ?? null)
        .filter((language): language is string => Boolean(language))
    )
  )
    .map((language) => language.toUpperCase())
    .sort();
  return {
    id: row.id,
    canonicalTitle: row.canonical_title,
    primaryCategory: row.primary_category,
    eventType: row.event_type,
    districtNames: districtNames(row.district_id),
    articleCount: row.article_count,
    sourceCount: row.source_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    languages,
    curated: members.some((m) => m.articles?.curated === true),
  };
}

/** Newest first; ISO timestamps share one offset, so string order is time order. */
function byLastSeenDesc(a: PublicStory, b: PublicStory): number {
  if (a.lastSeenAt < b.lastSeenAt) return 1;
  if (a.lastSeenAt > b.lastSeenAt) return -1;
  return 0;
}

export async function getFeed(options: { demo?: boolean } = {}): Promise<FeedResult> {
  if (options.demo) {
    return {
      stories: [...DEMO_STORIES].sort(byLastSeenDesc),
      configured: isSupabaseConfigured(),
      demo: true,
      error: null,
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return { stories: [], configured: false, demo: false, error: null };
  }

  try {
    // `.returns` pins the row shape: supabase-js without generated DB types
    // infers every embed as an array, but PostgREST returns to-one embeds
    // (story_articles → articles) as objects — StoryRow mirrors the runtime.
    const { data, error } = await client
      .from("stories")
      .select(STORY_SELECT)
      .order("last_seen_at", { ascending: false })
      .limit(60)
      .returns<StoryRow[]>();
    if (error) {
      return { stories: [], configured: true, demo: false, error: error.message };
    }
    return {
      stories: ((data ?? []) as StoryRow[]).map(toPublicStory),
      configured: true,
      demo: false,
      error: null,
    };
  } catch (err) {
    return {
      stories: [],
      configured: true,
      demo: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
