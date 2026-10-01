// Admin mutations (Phase 22): corrections become durable labelled data.
//
// Every change writes the new value AND an admin_corrections audit row
// (original prediction, corrected value, timestamp, classifier/rule
// version, optional reason). History is appended, never overwritten.
// Story controls (rename/move/merge/split) reuse the same audit trail.
import type { SupabaseClient } from "@supabase/supabase-js";

export type Db = SupabaseClient;

export interface ArticleCorrectionFields {
  article_type?: string;
  primary_category?: string;
  event_type?: string;
  district_id?: string;
  /** "true" | "false" | "" (unchanged) — recorded as 1.0 / 0.0. */
  bihar_relevant?: string;
  /** Comma-separated entity names; audit-only, links untouched. */
  entities?: string;
}

const ARTICLE_COLUMNS: Record<string, string> = {
  article_type: "article_type",
  primary_category: "primary_category",
  event_type: "event_type",
  district_id: "district_id",
};

async function maybeSingle<T>(
  query: PromiseLike<{ data: T | null; error: unknown }>
): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw error instanceof Error ? error : new Error(String(error));
  return data;
}

async function classifierVersion(db: Db, articleId: number): Promise<string> {
  const { data } = await db
    .from("classification_results")
    .select("classifier_version")
    .eq("article_id", articleId)
    .order("created_at", { ascending: false })
    .limit(1);
  const rows = (data ?? []) as Array<{ classifier_version: string }>;
  return rows[0]?.classifier_version ?? "unclassified";
}

export async function currentEntityNames(db: Db, articleId: number): Promise<string[]> {
  const { data: links } = await db
    .from("article_entities")
    .select("entity_id")
    .eq("article_id", articleId);
  const ids = ((links ?? []) as Array<{ entity_id: number }>).map((l) => l.entity_id);
  if (ids.length === 0) return [];
  const { data: entities } = await db.from("entities").select("id,canonical_name").in("id", ids);
  return ((entities ?? []) as Array<{ id: number; canonical_name: string }>)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((e) => e.canonical_name);
}

function parseNames(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Recount denormalized story stats from membership. */
export async function recountStory(db: Db, storyId: number): Promise<void> {
  const { data } = await db.from("articles").select("id,source_id").eq("story_id", storyId);
  const members = (data ?? []) as Array<{ id: number; source_id: number | null }>;
  await db
    .from("stories")
    .update({
      article_count: members.length,
      source_count: new Set(members.map((m) => m.source_id)).size,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", storyId);
}

export interface ArticleCorrectionResult {
  updatedFields: string[];
  corrections: number;
}

/** Correct article fields; unknown fields ignored, unchanged ones skipped. */
export async function correctArticle(
  db: Db,
  articleId: number,
  fields: ArticleCorrectionFields,
  reason?: string
): Promise<ArticleCorrectionResult> {
  const article = (await maybeSingle(
    db.from("articles").select("*").eq("id", articleId).maybeSingle() as never
  )) as null | {
    id: number;
    story_id: number | null;
    article_type: string | null;
    primary_category: string | null;
    event_type: string | null;
    district_id: string | null;
    bihar_relevance_score: number | null;
  };
  if (!article) throw new Error(`article ${articleId} not found`);

  const version = await classifierVersion(db, articleId);
  const patch: Record<string, string | number | null> = {};
  const audit: Array<Record<string, unknown>> = [];
  const stamp = new Date().toISOString();
  const cleanReason = reason?.trim() ? reason.trim() : null;

  const record = (field: string, oldValue: unknown, newValue: unknown) => {
    audit.push({
      article_id: articleId,
      story_id: article.story_id,
      field_name: field,
      old_value: oldValue == null ? null : String(oldValue),
      new_value: newValue == null ? null : String(newValue),
      reason: cleanReason,
      created_at: stamp,
    });
  };

  for (const [field, column] of Object.entries(ARTICLE_COLUMNS)) {
    const raw = fields[field as keyof ArticleCorrectionFields];
    if (raw == null || raw === "") continue;
    const current = (article as Record<string, unknown>)[column];
    if (String(current ?? "") === raw) continue;
    patch[column] = raw;
    record(field, current, raw);
  }

  if (fields.bihar_relevant === "true" || fields.bihar_relevant === "false") {
    const next = fields.bihar_relevant === "true" ? 1.0 : 0.0;
    if (article.bihar_relevance_score !== next) {
      patch["bihar_relevance_score"] = next;
      record("bihar_relevance", article.bihar_relevance_score, next);
    }
  }

  if (fields.entities != null && fields.entities.trim() !== "") {
    const next = parseNames(fields.entities);
    const current = await currentEntityNames(db, articleId);
    if (JSON.stringify([...current].sort()) !== JSON.stringify([...next].sort())) {
      record("entities", JSON.stringify(current), JSON.stringify(next));
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from("articles").update(patch).eq("id", articleId);
    if (error) throw error instanceof Error ? error : new Error(String(error));
  }
  if (audit.length > 0) {
    const { error } = await db
      .from("admin_corrections")
      .insert(audit.map((row) => ({ ...row, classifier_version: version })));
    if (error) throw error instanceof Error ? error : new Error(String(error));
  }
  return { updatedFields: Object.keys(patch), corrections: audit.length };
}

function cleanTitle(title: string): string {
  const trimmed = title.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) throw new Error("title must not be empty");
  if (trimmed.length > 300) throw new Error("title must be 300 characters or fewer");
  return trimmed;
}

async function requireStory(db: Db, storyId: number) {
  const story = (await maybeSingle(
    db.from("stories").select("*").eq("id", storyId).maybeSingle() as never
  )) as null | { id: number; canonical_title: string; status: string };
  if (!story) throw new Error(`story ${storyId} not found`);
  return story;
}

/** Rename a story; the old title stays in the audit trail. */
export async function renameStory(
  db: Db,
  storyId: number,
  title: string,
  reason?: string
): Promise<void> {
  const next = cleanTitle(title);
  const story = await requireStory(db, storyId);
  if (story.canonical_title === next) return;
  const { error } = await db.from("stories").update({ canonical_title: next }).eq("id", storyId);
  if (error) throw error instanceof Error ? error : new Error(String(error));
  const cleanReason = reason?.trim() ? reason.trim() : null;
  const { error: auditError } = await db.from("admin_corrections").insert({
    article_id: null,
    story_id: storyId,
    field_name: "canonical_title",
    old_value: story.canonical_title,
    new_value: next,
    reason: cleanReason,
    created_at: new Date().toISOString(),
  });
  if (auditError) throw auditError instanceof Error ? auditError : new Error(String(auditError));
}

async function assignArticle(
  db: Db,
  articleId: number,
  fromStoryId: number | null,
  toStoryId: number,
  reason: string | null,
  stamp: string
): Promise<void> {
  const { error: linkError } = await db.from("story_articles").delete().eq("article_id", articleId);
  if (linkError) throw linkError instanceof Error ? linkError : new Error(String(linkError));
  const { error: relinkError } = await db.from("story_articles").insert({
    story_id: toStoryId,
    article_id: articleId,
    cluster_score: null,
    created_at: stamp,
  });
  if (relinkError)
    throw relinkError instanceof Error ? relinkError : new Error(String(relinkError));
  const { error: articleError } = await db
    .from("articles")
    .update({ story_id: toStoryId })
    .eq("id", articleId);
  if (articleError)
    throw articleError instanceof Error ? articleError : new Error(String(articleError));
  const { error: auditError } = await db.from("admin_corrections").insert({
    article_id: articleId,
    story_id: toStoryId,
    field_name: "story_assignment",
    old_value: fromStoryId == null ? null : String(fromStoryId),
    new_value: String(toStoryId),
    reason,
    created_at: stamp,
  });
  if (auditError) throw auditError instanceof Error ? auditError : new Error(String(auditError));
}

async function storyMembers(db: Db, storyId: number): Promise<number[]> {
  const { data } = await db.from("articles").select("id").eq("story_id", storyId);
  return ((data ?? []) as Array<{ id: number }>).map((a) => a.id);
}

/** Move one article to an existing story, or to a newly created one. */
export async function moveArticle(
  db: Db,
  articleId: number,
  target: { kind: "story"; id: number } | { kind: "new"; title: string },
  reason?: string
): Promise<{ storyId: number }> {
  const article = (await maybeSingle(
    db.from("articles").select("id,story_id").eq("id", articleId).maybeSingle() as never
  )) as null | { id: number; story_id: number | null };
  if (!article) throw new Error(`article ${articleId} not found`);
  // Capture before any write: row objects may alias live table state.
  const fromStoryId: number | null = article.story_id;
  const cleanReason = reason?.trim() ? reason.trim() : null;
  const stamp = new Date().toISOString();
  let targetId: number;
  if (target.kind === "new") {
    const created = (await db
      .from("stories")
      .insert({
        canonical_title: cleanTitle(target.title),
        status: "active",
        article_count: 0,
        source_count: 0,
        first_seen_at: stamp,
        last_seen_at: stamp,
        created_at: stamp,
        updated_at: stamp,
      })
      .select()
      .single()) as unknown as { data: { id: number } | null; error: unknown };
    if (created.error || !created.data) {
      throw created.error instanceof Error
        ? created.error
        : new Error(String(created.error ?? "story creation failed"));
    }
    targetId = created.data.id;
  } else {
    await requireStory(db, target.id);
    targetId = target.id;
  }
  if (article.story_id === targetId) return { storyId: targetId };
  await assignArticle(db, articleId, fromStoryId, targetId, cleanReason, stamp);
  if (fromStoryId != null) await recountStory(db, fromStoryId);
  await recountStory(db, targetId);
  return { storyId: targetId };
}

/** Merge a source story into a target: all members move, source parks as merged. */
export async function mergeStories(
  db: Db,
  sourceId: number,
  targetId: number,
  reason?: string
): Promise<{ moved: number }> {
  if (sourceId === targetId) throw new Error("cannot merge a story into itself");
  const source = await requireStory(db, sourceId);
  await requireStory(db, targetId);
  const cleanReason = reason?.trim() ? reason.trim() : null;
  const stamp = new Date().toISOString();
  const members = await storyMembers(db, sourceId);
  for (const articleId of members) {
    await assignArticle(db, articleId, sourceId, targetId, cleanReason, stamp);
  }
  const { error: statusError } = await db
    .from("stories")
    .update({ status: "merged", updated_at: stamp })
    .eq("id", sourceId);
  if (statusError)
    throw statusError instanceof Error ? statusError : new Error(String(statusError));
  const { error: auditError } = await db.from("admin_corrections").insert({
    article_id: null,
    story_id: sourceId,
    field_name: "status",
    old_value: source.status,
    new_value: "merged",
    reason: cleanReason,
    created_at: stamp,
  });
  if (auditError) throw auditError instanceof Error ? auditError : new Error(String(auditError));
  await recountStory(db, sourceId);
  await recountStory(db, targetId);
  return { moved: members.length };
}

/** Split selected members into a new story; at least one member stays behind. */
export async function splitStory(
  db: Db,
  storyId: number,
  articleIds: number[],
  newTitle: string,
  reason?: string
): Promise<{ storyId: number }> {
  await requireStory(db, storyId);
  const members = await storyMembers(db, storyId);
  const moving = [...new Set(articleIds.map(Number).filter((n) => Number.isInteger(n)))].filter(
    (id) => members.includes(id)
  );
  if (moving.length === 0) throw new Error("no selected articles belong to this story");
  if (moving.length >= members.length) {
    throw new Error("splitting every member is a rename, not a split");
  }
  const cleanReason = reason?.trim() ? reason.trim() : null;
  const stamp = new Date().toISOString();
  const created = (await db
    .from("stories")
    .insert({
      canonical_title: cleanTitle(newTitle),
      status: "active",
      article_count: 0,
      source_count: 0,
      first_seen_at: stamp,
      last_seen_at: stamp,
      created_at: stamp,
      updated_at: stamp,
    })
    .select()
    .single()) as unknown as { data: { id: number } | null; error: unknown };
  if (created.error || !created.data) {
    throw created.error instanceof Error
      ? created.error
      : new Error(String(created.error ?? "story creation failed"));
  }
  for (const articleId of moving) {
    await assignArticle(db, articleId, storyId, created.data.id, cleanReason, stamp);
  }
  await recountStory(db, storyId);
  await recountStory(db, created.data.id);
  return { storyId: created.data.id };
}
