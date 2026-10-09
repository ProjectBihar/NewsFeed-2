// Public timeline reads one database page; other archives reuse the metadata mapping.
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";
import districtsData from "../../../data/geography/districts.json";
import { DEMO_STORIES } from "./demo-stories";
import type { PublicStory } from "./types";
import { FEED_PAGE_SIZE, parseTimelineParams, timelineBounds } from "./timeline";

export interface FeedResult {
  stories: PublicStory[];
  total: number;
  page: number;
  totalPages: number;
  asOf: string;
  start: string;
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
  languages?: string[];
  date_verified?: boolean;
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

/** Shared row mapping; classification is internal, languages remain reader-facing. */
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
    languages: row.languages ?? languages,
    dateVerified: row.date_verified,
    curated: members.some((m) => m.articles?.curated === true),
  };
}

/** Only a single 90-card database page is sent to the reader. */
export async function getFeed(
  options: { demo?: boolean; page?: number; asOf?: string; now?: Date } = {}
): Promise<FeedResult> {
  const now = options.now ?? new Date();
  const parsed = parseTimelineParams({ page: String(options.page ?? 1), asof: options.asOf }, now);
  // Demo time is anchored to the fixture corpus; live time always follows IST today.
  const asOf = options.demo ? "2026-09-30T18:00:00.000Z" : parsed.asOf;
  const start = timelineBounds(new Date(asOf)).start;
  const empty: FeedResult = {
    stories: [],
    total: 0,
    page: 1,
    totalPages: 1,
    asOf,
    start,
    configured: isSupabaseConfigured(),
    demo: Boolean(options.demo),
    error: null,
  };
  if (options.demo) {
    const stories = [...DEMO_STORIES]
      .filter(
        (s) =>
          Date.parse(s.lastSeenAt) >= Date.parse(start) &&
          Date.parse(s.lastSeenAt) <= Date.parse(asOf)
      )
      .sort(
        (a, b) =>
          Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt) ||
          String(b.id).localeCompare(String(a.id))
      );
    const totalPages = Math.max(1, Math.ceil(stories.length / FEED_PAGE_SIZE));
    const page = Math.min(parsed.page, totalPages);
    return {
      ...empty,
      total: stories.length,
      totalPages,
      page,
      stories: stories.slice((page - 1) * FEED_PAGE_SIZE, page * FEED_PAGE_SIZE),
    };
  }
  const client = getSupabaseClient();
  if (!client) return empty;
  try {
    const { data, error } = await client.rpc("public_timeline", {
      p_page: parsed.page,
      p_as_of: asOf,
    });
    if (error) throw error;
    const result = data as {
      stories: StoryRow[];
      total: number;
      page: number;
      totalPages: number;
      asOf: string;
      start: string;
    };
    if (!result || !Array.isArray(result.stories))
      throw new Error("Timeline response unavailable.");
    return { ...empty, ...result, stories: result.stories.map(toPublicStory) };
  } catch (err) {
    return {
      ...empty,
      error:
        err instanceof Error ? err.message : String((err as { message?: string }).message ?? err),
    };
  }
}
