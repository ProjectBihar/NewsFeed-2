// Read-only admin queries (Phase 21). Thin Supabase selects; shaping in
// summarize.ts. Mutations arrive with Phase 22 corrections UI.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../supabase";

export function requireClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase is not configured (see .env.example).");
  }
  return client;
}

const SOURCE_COLUMNS =
  "id,name,domain,language,scope,source_type,priority,active,requires_browser,created_at";
const ENDPOINT_COLUMNS =
  "id,source_id,endpoint_type,url,active,priority,last_checked,last_seen_url,last_seen_published_at,last_success_at";
const HEALTH_COLUMNS =
  "id,source_id,checked_at,fetch_success_rate,extraction_success_rate,articles_discovered,http_403_count,http_429_count,failure_count,health_state,diagnostics";
const RUN_COLUMNS =
  "id,started_at,completed_at,status,sources_attempted,sources_succeeded,urls_discovered,urls_fetched,articles_extracted,articles_relevant,stories_created,errors";
const QUEUE_COLUMNS =
  "id,url,canonical_url,source_id,discovery_method,priority,status,attempts,next_retry_at,last_attempt_at,last_error,discovered_at";

export async function getSources(client: SupabaseClient = requireClient()) {
  const { data, error } = await client.from("sources").select(SOURCE_COLUMNS).order("name");
  if (error) throw error;
  return data;
}

export async function getEndpoints(client: SupabaseClient = requireClient()) {
  const { data, error } = await client
    .from("source_endpoints")
    .select(ENDPOINT_COLUMNS)
    .order("source_id");
  if (error) throw error;
  return data;
}

export async function getRecentHealth(client: SupabaseClient = requireClient(), limit = 500) {
  const { data, error } = await client
    .from("source_health")
    .select(HEALTH_COLUMNS)
    .order("checked_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getRecentRuns(limit = 50, client: SupabaseClient = requireClient()) {
  const { data, error } = await client
    .from("crawl_runs")
    .select(RUN_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export type QueueFilter = "failed" | "blocked" | "retry" | "rejected";

export async function getQueue(
  client: SupabaseClient = requireClient(),
  status: QueueFilter = "failed",
  limit = 200
) {
  const { data, error } = await client
    .from("crawl_queue")
    .select(QUEUE_COLUMNS)
    .eq("status", status)
    .order("last_attempt_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getLowExtraction(client: SupabaseClient = requireClient(), limit = 200) {
  const { data, error } = await client
    .from("articles")
    .select("id,source_id,url,headline,extraction_confidence,published_at,created_at")
    .eq("extraction_confidence", "low")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getLowClassification(
  client: SupabaseClient = requireClient(),
  cutoff = 0.6,
  limit = 200
) {
  const { data, error } = await client
    .from("classification_results")
    .select(
      "id,article_id,classifier_version,category,article_type,event_type,confidence,reason_codes,created_at"
    )
    .lt("confidence", cutoff)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function getStories(client: SupabaseClient = requireClient(), limit = 200) {
  const { data: stories, error } = await client
    .from("stories")
    .select(
      "id,canonical_title,primary_category,event_type,district_id,article_count,source_count,first_seen_at,last_seen_at,status"
    )
    .order("last_seen_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const ids = (stories ?? []).map((s) => (s as { id: number }).id);
  if (ids.length === 0) return [];
  const { data: links, error: linkError } = await client
    .from("story_articles")
    .select("story_id,article_id,cluster_score")
    .in("story_id", ids);
  if (linkError) throw linkError;
  const articleIds = [
    ...new Set((links ?? []).map((l) => (l as { article_id: number }).article_id)),
  ];
  let articlesById = new Map<number, { id: number; headline: string | null }>();
  if (articleIds.length > 0) {
    const { data: articles, error: articleError } = await client
      .from("articles")
      .select("id,headline")
      .in("id", articleIds);
    if (articleError) throw articleError;
    articlesById = new Map(
      ((articles ?? []) as Array<{ id: number; headline: string | null }>).map((a) => [a.id, a])
    );
  }
  const linksByStory = new Map<
    number,
    Array<{ article_id: number; cluster_score: number | null }>
  >();
  for (const link of (links ?? []) as Array<{
    story_id: number;
    article_id: number;
    cluster_score: number | null;
  }>) {
    const list = linksByStory.get(link.story_id) ?? [];
    list.push({ article_id: link.article_id, cluster_score: link.cluster_score });
    linksByStory.set(link.story_id, list);
  }
  return ((stories ?? []) as Array<Record<string, unknown>>).map((story) => ({
    ...story,
    members: (linksByStory.get(story["id"] as number) ?? []).map((m) => ({
      ...m,
      headline: articlesById.get(m.article_id)?.headline ?? null,
    })),
  }));
}

export async function getCorrections(client: SupabaseClient = requireClient(), limit = 200) {
  const { data, error } = await client
    .from("admin_corrections")
    .select("id,article_id,story_id,field_name,old_value,new_value,reason,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export interface StoryMember {
  article_id: number;
  cluster_score: number | null;
  id: number;
  headline: string | null;
  url: string;
  article_type: string | null;
  primary_category: string | null;
  event_type: string | null;
  district_id: string | null;
  bihar_relevance_score: number | null;
  source_id: number | null;
  entity_names: string[];
}

export interface StoryDetail {
  id: number;
  canonical_title: string;
  primary_category: string | null;
  event_type: string | null;
  district_id: string | null;
  status: string;
  article_count: number;
  source_count: number;
  members: StoryMember[];
}

/** One story with members, field values, and entity names for correction forms. */
export async function getStory(
  client: SupabaseClient = requireClient(),
  storyId: number
): Promise<StoryDetail | null> {
  const { data: story, error } = await client
    .from("stories")
    .select("*")
    .eq("id", storyId)
    .maybeSingle();
  if (error) throw error;
  if (!story) return null;
  const row = story as Record<string, unknown>;
  const { data: links, error: linkError } = await client
    .from("story_articles")
    .select(
      "article_id,cluster_score,articles(id,headline,url,article_type,primary_category,event_type,district_id,bihar_relevance_score,source_id)"
    )
    .eq("story_id", storyId);
  if (linkError) throw linkError;
  const memberRows: Array<Record<string, unknown>> = (
    (links ?? []) as Array<Record<string, unknown>>
  ).map((l) => ({
    article_id: l["article_id"] as number,
    cluster_score: (l["cluster_score"] as number | null) ?? null,
    ...((l["articles"] ?? {}) as Record<string, unknown>),
  }));
  const memberIds = memberRows.map((m) => m["article_id"] as number);
  const namesByArticle = new Map<number, string[]>();
  if (memberIds.length > 0) {
    const { data: joins, error: joinError } = await client
      .from("article_entities")
      .select("article_id,entity_id")
      .in("article_id", memberIds);
    if (joinError) throw joinError;
    const entityIds = [
      ...new Set(((joins ?? []) as Array<{ entity_id: number }>).map((j) => j.entity_id)),
    ];
    const names = new Map<number, string>();
    if (entityIds.length > 0) {
      const { data: entities, error: entityError } = await client
        .from("entities")
        .select("id,canonical_name")
        .in("id", entityIds);
      if (entityError) throw entityError;
      for (const e of (entities ?? []) as Array<{ id: number; canonical_name: string }>) {
        names.set(e.id, e.canonical_name);
      }
    }
    for (const j of (joins ?? []) as Array<{ article_id: number; entity_id: number }>) {
      const list = namesByArticle.get(j.article_id) ?? [];
      const name = names.get(j.entity_id);
      if (name) list.push(name);
      namesByArticle.set(j.article_id, list);
    }
  }
  return {
    id: row["id"] as number,
    canonical_title: row["canonical_title"] as string,
    primary_category: (row["primary_category"] as string | null) ?? null,
    event_type: (row["event_type"] as string | null) ?? null,
    district_id: (row["district_id"] as string | null) ?? null,
    status: row["status"] as string,
    article_count: row["article_count"] as number,
    source_count: row["source_count"] as number,
    members: memberRows.map((m) => ({
      article_id: m["article_id"] as number,
      cluster_score: m["cluster_score"] as number | null,
      id: m["id"] as number,
      headline: (m["headline"] as string | null) ?? null,
      url: m["url"] as string,
      article_type: (m["article_type"] as string | null) ?? null,
      primary_category: (m["primary_category"] as string | null) ?? null,
      event_type: (m["event_type"] as string | null) ?? null,
      district_id: (m["district_id"] as string | null) ?? null,
      bihar_relevance_score: (m["bihar_relevance_score"] as number | null) ?? null,
      source_id: (m["source_id"] as number | null) ?? null,
      entity_names: namesByArticle.get(m["article_id"] as number) ?? [],
    })),
  };
}

/** Lightweight id+title list for move/merge targets. */
export async function getStoryOptions(client: SupabaseClient = requireClient()) {
  const { data, error } = await client
    .from("stories")
    .select("id,canonical_title,status")
    .order("last_seen_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw error;
  return data;
}
