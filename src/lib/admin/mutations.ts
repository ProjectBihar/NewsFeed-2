// Mutations execute as one PostgreSQL transaction through a service-only RPC.
import type { SupabaseClient } from "@supabase/supabase-js";
export type Db = SupabaseClient;
export interface ArticleCorrectionFields {
  article_type?: string;
  primary_category?: string;
  event_type?: string;
  district_id?: string;
  bihar_relevant?: string;
  /** Comma-separated canonical names; a present empty string clears links. */
  entities?: string;
}
export interface ArticleCorrectionResult {
  updatedFields: string[];
  corrections: number;
}
async function mutate<T>(
  db: Db,
  operation: string,
  id: number,
  args: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await db.rpc("admin_mutate", {
    p_operation: operation,
    p_id: id,
    ...args,
  });
  if (error) throw new Error(error.message);
  return data as T;
}
export async function currentEntityNames(db: Db, articleId: number): Promise<string[]> {
  const { data: links, error: linkError } = await db
    .from("article_entities")
    .select("entity_id")
    .eq("article_id", articleId);
  if (linkError) throw new Error(linkError.message);
  const ids = ((links ?? []) as Array<{ entity_id: number }>).map((l) => l.entity_id);
  if (!ids.length) return [];
  const { data, error } = await db.from("entities").select("id,canonical_name").in("id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ id: number; canonical_name: string }>)
    .sort((a, b) => a.id - b.id)
    .map((e) => e.canonical_name);
}
export async function recountStory(db: Db, storyId: number): Promise<void> {
  const { error } = await db.rpc("recount_story_metadata", { p_story_id: storyId });
  if (error) throw new Error(error.message);
}
export function correctArticle(
  db: Db,
  articleId: number,
  fields: ArticleCorrectionFields,
  reason?: string
) {
  return mutate<ArticleCorrectionResult>(db, "correct", articleId, {
    p_fields: fields,
    p_reason: reason ?? null,
  });
}
export async function renameStory(
  db: Db,
  storyId: number,
  title: string,
  reason?: string
): Promise<void> {
  await mutate(db, "rename", storyId, { p_title: title, p_reason: reason ?? null });
}
export function moveArticle(
  db: Db,
  articleId: number,
  target: { kind: "story"; id: number } | { kind: "new"; title: string },
  reason?: string
) {
  return mutate<{ storyId: number }>(db, "move", articleId, {
    p_target: target.kind === "story" ? target.id : null,
    p_title: target.kind === "new" ? target.title : null,
    p_reason: reason ?? null,
  });
}
export function mergeStories(db: Db, sourceId: number, targetId: number, reason?: string) {
  return mutate<{ moved: number }>(db, "merge", sourceId, {
    p_target: targetId,
    p_reason: reason ?? null,
  });
}
export function splitStory(
  db: Db,
  storyId: number,
  articleIds: number[],
  newTitle: string,
  reason?: string
) {
  return mutate<{ storyId: number }>(db, "split", storyId, {
    p_article_ids: articleIds,
    p_title: newTitle,
    p_reason: reason ?? null,
  });
}
