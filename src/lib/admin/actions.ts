"use server";

// Server-action glue for Phase 22 corrections (thin by design: all
// logic and audit writes live in mutations.ts, covered by tests).
import { revalidatePath } from "next/cache";
import { correctArticle, mergeStories, moveArticle, renameStory, splitStory } from "./mutations";
import { ARTICLE_TYPES, CATEGORIES, DISTRICTS, EVENT_TYPES } from "./options";
import { requireClient } from "./queries";

function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function num(form: FormData, key: string): number {
  const value = Number(str(form, key));
  if (!Number.isInteger(value)) throw new Error(`bad ${key}`);
  return value;
}

function oneOf(value: string, allowed: readonly string[], field: string): string | undefined {
  if (value === "") return undefined;
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`bad ${field}: ${value}`);
  return value;
}

const DISTRICT_IDS = DISTRICTS.map((d) => d.id);

export async function correctArticleAction(formData: FormData): Promise<void> {
  const articleId = num(formData, "articleId");
  await correctArticle(
    requireClient(),
    articleId,
    {
      article_type: oneOf(str(formData, "article_type"), ARTICLE_TYPES, "article_type"),
      primary_category: oneOf(str(formData, "primary_category"), CATEGORIES, "primary_category"),
      event_type: oneOf(str(formData, "event_type"), EVENT_TYPES, "event_type"),
      district_id: oneOf(str(formData, "district_id"), DISTRICT_IDS, "district_id"),
      bihar_relevant:
        str(formData, "bihar_relevant") === ""
          ? undefined
          : oneOf(str(formData, "bihar_relevant"), ["true", "false"], "bihar_relevant"),
      entities: str(formData, "entities") === "" ? undefined : str(formData, "entities"),
    },
    str(formData, "reason") || undefined
  );
  revalidatePath("/admin/stories");
}

export async function renameStoryAction(formData: FormData): Promise<void> {
  const storyId = num(formData, "storyId");
  await renameStory(
    requireClient(),
    storyId,
    str(formData, "title"),
    str(formData, "reason") || undefined
  );
  revalidatePath("/admin/stories");
  revalidatePath(`/admin/stories/${storyId}`);
}

export async function moveArticleAction(formData: FormData): Promise<void> {
  const articleId = num(formData, "articleId");
  const target = str(formData, "target");
  const reason = str(formData, "reason") || undefined;
  const client = requireClient();
  if (target === "__new__") {
    await moveArticle(client, articleId, { kind: "new", title: str(formData, "newTitle") }, reason);
  } else {
    const targetId = Number(target);
    if (!Number.isInteger(targetId)) throw new Error("bad target");
    await moveArticle(client, articleId, { kind: "story", id: targetId }, reason);
  }
  revalidatePath("/admin/stories");
}

export async function mergeStoriesAction(formData: FormData): Promise<void> {
  const sourceId = num(formData, "sourceId");
  const targetId = num(formData, "targetId");
  await mergeStories(requireClient(), sourceId, targetId, str(formData, "reason") || undefined);
  revalidatePath("/admin/stories");
}

export async function splitStoryAction(formData: FormData): Promise<void> {
  const storyId = num(formData, "storyId");
  const articleIds = formData
    .getAll("articleIds")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
  await splitStory(
    requireClient(),
    storyId,
    articleIds,
    str(formData, "newTitle"),
    str(formData, "reason") || undefined
  );
  revalidatePath("/admin/stories");
  revalidatePath(`/admin/stories/${storyId}`);
}
