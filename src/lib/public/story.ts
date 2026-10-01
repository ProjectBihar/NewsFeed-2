// Public story detail read (Phase 30): the structure behind a clustered
// development — facts, per-source reports, and entities.
//
// Provenance rule: reports link to the ORIGINAL PUBLISHER (the article's own
// canonical URL live; the registry homepage for demo stories). Full article
// bodies are never fetched or rendered here (plan: do not republish
// copyrighted articles).
import { getSupabaseClient } from "../supabase";
import { demoArticlesForStory } from "./demo-articles";
import { DEMO_ENTITIES, demoPublisher } from "./demo-story-details";
import { DEMO_STORIES } from "./demo-stories";
import { STORY_COLUMNS, districtNames } from "./feed";
import type { PublicStory } from "./types";

export interface StoryReport {
  sourceName: string;
  publishedAt: string | null;
  /** null when the publisher URL is genuinely unknown — never fabricated. */
  url: string | null;
}

export interface StoryDetail {
  id: string;
  canonicalTitle: string;
  primaryCategory: string | null;
  eventType: string | null;
  districtNames: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  articleCount: number;
  sourceCount: number;
  languages: string[];
  /** First-reported order (unknown times last). */
  reports: StoryReport[];
  entities: string[];
  demo: boolean;
}

interface StoryDetailRow {
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
    articles: {
      id: number;
      canonical_url: string;
      published_at: string | null;
      language: string | null;
      sources: { name: string; domain: string } | null;
    } | null;
  }> | null;
}

const STORY_DETAIL_SELECT = `${STORY_COLUMNS},story_articles(articles(id,canonical_url,published_at,language,sources(name,domain)))`;

/** Oldest report first; unknown times sort last. Offsets differ only by
 *  source formatting, so string order within a timezone group is time order;
 *  mixed groups still get a stable, testable ordering. */
export function sortReports(reports: StoryReport[]): StoryReport[] {
  return [...reports].sort((a, b) => {
    if (a.publishedAt === b.publishedAt) return 0;
    if (a.publishedAt === null) return 1;
    if (b.publishedAt === null) return -1;
    return a.publishedAt < b.publishedAt ? -1 : 1;
  });
}

/** Exported for unit tests: DB detail row → reader story detail. */
export function toStoryDetail(row: StoryDetailRow): StoryDetail {
  const articles = (row.story_articles ?? [])
    .map((m) => m.articles)
    .filter((a): a is NonNullable<typeof a> => Boolean(a));
  const languages = Array.from(
    new Set(
      articles
        .map((a) => a.language ?? null)
        .filter((language): language is string => Boolean(language))
    )
  )
    .map((language) => language.toUpperCase())
    .sort();

  return {
    id: String(row.id),
    canonicalTitle: row.canonical_title,
    primaryCategory: row.primary_category,
    eventType: row.event_type,
    districtNames: districtNames(row.district_id),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    articleCount: row.article_count,
    sourceCount: row.source_count,
    languages,
    reports: sortReports(
      articles.map((a) => ({
        sourceName: a.sources?.name ?? "Unknown source",
        publishedAt: a.published_at,
        url: a.canonical_url,
      }))
    ),
    entities: [],
    demo: false,
  };
}

/** Distinct entity names across the story's articles, most-mentioned first
 *  (name ascending on ties). */
async function liveEntities(
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
  articleIds: number[]
): Promise<string[]> {
  if (articleIds.length === 0) return [];
  const { data: joins, error: joinError } = await client
    .from("article_entities")
    .select("article_id,entity_id")
    .in("article_id", articleIds);
  if (joinError || !joins || joins.length === 0) return [];
  const entityIds = [...new Set(joins.map((j) => j.entity_id))];
  const { data: names, error: nameError } = await client
    .from("entities")
    .select("id,canonical_name")
    .in("id", entityIds);
  if (nameError || !names) return [];
  const byId = new Map(names.map((n) => [n.id, n.canonical_name]));
  const mentions = new Map<string, number>();
  for (const join of joins) {
    const name = byId.get(join.entity_id);
    if (name) mentions.set(name, (mentions.get(name) ?? 0) + 1);
  }
  return [...mentions.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

function demoStoryDetail(story: PublicStory): StoryDetail {
  const id = String(story.id);
  // Reports derive from the shared fixture article corpus (Phase 31).
  const reports = demoArticlesForStory(id).map((article) => {
    const publisher = demoPublisher(article.source);
    return {
      sourceName: publisher.name,
      publishedAt: article.publishedAt,
      url: publisher.homepage,
    };
  });
  return {
    id,
    canonicalTitle: story.canonicalTitle,
    primaryCategory: story.primaryCategory,
    eventType: story.eventType,
    districtNames: story.districtNames,
    firstSeenAt: story.firstSeenAt,
    lastSeenAt: story.lastSeenAt,
    articleCount: story.articleCount,
    sourceCount: story.sourceCount,
    languages: story.languages,
    reports: sortReports(reports),
    entities: DEMO_ENTITIES[id] ?? [],
    demo: true,
  };
}

/** One story's public detail; null when it does not exist (or the database
 *  is not configured — no story can exist there, so 404 is honest). */
export async function getStory(
  id: string,
  options: { demo?: boolean } = {}
): Promise<StoryDetail | null> {
  if (options.demo) {
    const story = DEMO_STORIES.find((s) => String(s.id) === id);
    return story ? demoStoryDetail(story) : null;
  }

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("stories")
      .select(STORY_DETAIL_SELECT)
      .eq("id", numericId)
      .maybeSingle();
    if (error || !data) return null;
    // Runtime shape pinned manually: supabase-js infers nested to-one embeds
    // as arrays without generated DB types; PostgREST returns objects.
    const detail = toStoryDetail(data as unknown as StoryDetailRow);
    const articleIds = ((data as unknown as StoryDetailRow).story_articles ?? [])
      .map((m) => m.articles?.id)
      .filter((a): a is number => typeof a === "number");
    detail.entities = await liveEntities(client, articleIds);
    return detail;
  } catch {
    return null;
  }
}
