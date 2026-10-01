// Archive search (Phase 34): the plan's "useful archive search without
// Elasticsearch — PostgreSQL search capabilities first." Text tokens (AND
// semantics) are matched across the plan's field list — story titles,
// article headlines, entities, districts, categories, sources — with the
// plan's filters (date, district, category, article type, event type,
// source, language), server-paginated like the archive.
//
// Live: one `search_story_ids` RPC (migration 20260930000002) executes the
// search in SQL and returns `{ total, ids }` — the exact count plus one
// page window of ids (hard-capped at 100 in SQL); ids hydrate through the
// same `STORY_SELECT` the feed uses, reordered to the SQL rank. Demo: the
// identical semantics run in-process over the fixture corpus and story
// entities. The fixture carries no article-type labels, so that filter
// honestly matches nothing in the demo view — the page says so rather than
// inventing types.
//
// Parsing is strict like the archive: unknown filter values, malformed
// dates/pages, and over-long queries return null so the page 404s instead
// of guessing. An empty query with no filters is a valid "prompt" state,
// not an error. The date filter is year-granular (month-level browsing
// lives on /archive, which keeps its own month select).
import { ARTICLE_TYPES, EVENT_TYPES } from "@/lib/admin/options";
import { DEMO_PAGE_SIZE, LIVE_PAGE_SIZE, paginate } from "./archive";
import { CATEGORIES } from "./categories";
import { getDistrictBySlug, slugForDistrictName } from "./districts";
import { demoArticlesForStory } from "./demo-articles";
import { DEMO_ENTITIES, demoPublisher } from "./demo-story-details";
import { DEMO_STORIES } from "./demo-stories";
import { STORY_SELECT, toPublicStory, type StoryRow } from "./feed";
import { getSourceBySlug } from "./sources";
import type { PublicStory } from "./types";
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";

/** Language codes the classifier can emit (intelligence/language PROFILES:
 * en/hi only — the vocabulary is asserted against that detector). */
export const LANGUAGES = ["en", "hi"] as const;

/** Longest accepted query; longer hand-made URLs 404 (the form's input is
 * capped by maxlength too). */
export const MAX_QUERY_LENGTH = 100;

export interface SearchParams {
  /** Trimmed raw query (may be ""). */
  q: string;
  /** Whitespace/comma-split tokens of `q` (empty when there is no query). */
  tokens: string[];
  district: string | null;
  /** Category slug (label resolved from the public pill vocabulary). */
  category: string | null;
  articleType: string | null;
  eventType: string | null;
  /** Active registry source slug. */
  source: string | null;
  language: string | null;
  year: number | null;
  page: number;
  demo: boolean;
}

export interface SearchResult {
  /** The page window only — never the whole result set. */
  stories: PublicStory[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  configured: boolean;
  demo: boolean;
  error: string | null;
}

function readField(
  sp: Record<string, string | string[] | undefined>,
  key: string
): { invalid: boolean; value: string | null } {
  const raw = sp[key];
  if (raw === undefined) return { invalid: false, value: null };
  if (Array.isArray(raw)) return { invalid: true, value: null }; // repeated param
  if (raw === "") return { invalid: false, value: null }; // empty form field = absent
  return { invalid: false, value: raw };
}

/** Strict search query parsing; null → the page 404s. */
export function parseSearchParams(
  sp: Record<string, string | string[] | undefined>
): SearchParams | null {
  const qField = readField(sp, "q");
  const districtField = readField(sp, "district");
  const categoryField = readField(sp, "category");
  const articleTypeField = readField(sp, "type");
  const eventTypeField = readField(sp, "event");
  const sourceField = readField(sp, "source");
  const languageField = readField(sp, "language");
  const yearField = readField(sp, "year");
  const pageField = readField(sp, "page");
  if (
    qField.invalid ||
    districtField.invalid ||
    categoryField.invalid ||
    articleTypeField.invalid ||
    eventTypeField.invalid ||
    sourceField.invalid ||
    languageField.invalid ||
    yearField.invalid ||
    pageField.invalid
  ) {
    return null;
  }

  // Trimmed + interior whitespace collapsed (display and re-encoded URLs
  // stay clean; tokenisation is unaffected).
  const q = (qField.value ?? "").trim().replace(/\s+/g, " ");
  if (q.length > MAX_QUERY_LENGTH) return null;
  const tokens = q === "" ? [] : q.split(/[\s,]+/).filter(Boolean);

  let district: string | null = null;
  if (districtField.value !== null) {
    if (!getDistrictBySlug(districtField.value)) return null;
    district = districtField.value;
  }

  let category: string | null = null;
  if (categoryField.value !== null) {
    if (!CATEGORIES.some((entry) => entry.slug === categoryField.value)) return null;
    category = categoryField.value;
  }

  let articleType: string | null = null;
  if (articleTypeField.value !== null) {
    if (!(ARTICLE_TYPES as readonly string[]).includes(articleTypeField.value)) return null;
    articleType = articleTypeField.value;
  }

  let eventType: string | null = null;
  if (eventTypeField.value !== null) {
    if (!(EVENT_TYPES as readonly string[]).includes(eventTypeField.value)) return null;
    eventType = eventTypeField.value;
  }

  let source: string | null = null;
  if (sourceField.value !== null) {
    // Active registry slugs only — the same vocabulary /source publishes.
    if (!getSourceBySlug(sourceField.value)) return null;
    source = sourceField.value;
  }

  let language: string | null = null;
  if (languageField.value !== null) {
    if (!(LANGUAGES as readonly string[]).includes(languageField.value)) return null;
    language = languageField.value;
  }

  let year: number | null = null;
  if (yearField.value !== null) {
    if (!/^\d{4}$/.test(yearField.value)) return null;
    year = Number(yearField.value);
  }

  let page = 1;
  if (pageField.value !== null) {
    if (!/^\d+$/.test(pageField.value)) return null;
    page = Number(pageField.value);
    if (page < 1) return null;
  }

  return {
    q,
    tokens,
    district,
    category,
    articleType,
    eventType,
    source,
    language,
    year,
    page,
    demo: sp.demo === "1",
  };
}

/** True when the reader asked anything at all (query or any filter) —
 * drives results vs the prompt state. */
export function hasSearchCriteria(params: SearchParams): boolean {
  return (
    params.tokens.length > 0 ||
    params.district !== null ||
    params.category !== null ||
    params.articleType !== null ||
    params.eventType !== null ||
    params.source !== null ||
    params.language !== null ||
    params.year !== null
  );
}

/** Shared token normalisation with the SQL `search_norm`: lowercase with
 * - and _ folded to spaces, so `bihar-cabinet`, `Bihar Cabinet` and
 * `bihar cabinet` are one token on both paths. */
export function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/-/g, " ").replace(/_/g, " ");
}

/** One token against every plan search field of one story (demo path,
 * mirroring `search_story_ids` field for field). */
function matchesToken(story: PublicStory, token: string): boolean {
  const needle = normalizeSearchText(token);
  if (normalizeSearchText(story.canonicalTitle).includes(needle)) return true;
  if (story.primaryCategory && normalizeSearchText(story.primaryCategory).includes(needle)) {
    return true;
  }
  for (const name of story.districtNames) {
    const slug = slugForDistrictName(name);
    if (slug && normalizeSearchText(slug).includes(needle)) return true;
  }
  for (const entity of DEMO_ENTITIES[String(story.id)] ?? []) {
    if (normalizeSearchText(entity).includes(needle)) return true;
  }
  for (const article of demoArticlesForStory(String(story.id))) {
    if (normalizeSearchText(article.headline).includes(needle)) return true;
    const publisher = demoPublisher(article.source);
    if (normalizeSearchText(publisher.name).includes(needle)) return true;
    const registrySource = getSourceBySlug(article.source);
    if (registrySource && normalizeSearchText(registrySource.domain).includes(needle)) {
      return true;
    }
  }
  return false;
}

/** Rank tier 1: the headline itself contains every token (SQL title_match). */
function titleMatches(story: PublicStory, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const title = normalizeSearchText(story.canonicalTitle);
  return tokens.every((token) => title.includes(normalizeSearchText(token)));
}

function matchesFilters(story: PublicStory, params: SearchParams): boolean {
  if (params.district !== null) {
    const district = getDistrictBySlug(params.district);
    if (!district || !story.districtNames.includes(district.name)) return false;
  }
  if (params.category !== null) {
    const label = CATEGORIES.find((entry) => entry.slug === params.category)?.label;
    if (!label || story.primaryCategory !== label) return false;
  }
  if (params.eventType !== null && story.eventType !== params.eventType) return false;
  // The reviewed fixture carries no article-type labels — honest miss, the
  // page explains it instead of the filter silently disappearing.
  if (params.articleType !== null) return false;
  if (params.source !== null) {
    const members = demoArticlesForStory(String(story.id));
    if (!members.some((member) => member.source === params.source)) return false;
  }
  if (params.language !== null) {
    const wanted = params.language.toLowerCase();
    if (!story.languages.some((language) => language.toLowerCase() === wanted)) return false;
  }
  if (params.year !== null && !story.firstSeenAt.startsWith(String(params.year))) {
    return false;
  }
  return true;
}

/** Mirror of the SQL ORDER BY: title tier, first-reported desc, id desc. */
function bySearchRank(a: PublicStory, b: PublicStory, tokens: string[]): number {
  const aTitle = titleMatches(a, tokens);
  const bTitle = titleMatches(b, tokens);
  if (aTitle !== bTitle) return aTitle ? -1 : 1;
  if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt < b.firstSeenAt ? 1 : -1;
  return String(b.id).localeCompare(String(a.id));
}

function emptyResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    stories: [],
    page: 1,
    totalPages: 1,
    total: 0,
    pageSize: LIVE_PAGE_SIZE,
    configured: false,
    demo: false,
    error: null,
    ...overrides,
  };
}

/** Honest message extraction: supabase-js errors are plain objects with a
 * `message` field (not Error instances), and String(obj) would render
 * "[object Object]" to the reader. */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error !== null && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function demoSearch(params: SearchParams, configured: boolean): SearchResult {
  const candidates = DEMO_STORIES.filter(
    (story) =>
      matchesFilters(story, params) && params.tokens.every((token) => matchesToken(story, token))
  );
  candidates.sort((a, b) => bySearchRank(a, b, params.tokens));
  const window = paginate(candidates, params.page, DEMO_PAGE_SIZE);
  return {
    stories: window.items,
    page: window.page,
    totalPages: window.totalPages,
    total: window.total,
    pageSize: DEMO_PAGE_SIZE,
    configured,
    demo: true,
    error: null,
  };
}

interface SearchIdsPayload {
  total: number | string;
  ids: Array<number | string>;
}

export async function getSearch(params: SearchParams): Promise<SearchResult> {
  if (params.demo) return demoSearch(params, isSupabaseConfigured());

  const client = getSupabaseClient();
  if (!client) return emptyResult();

  try {
    const categoryLabel =
      params.category !== null
        ? (CATEGORIES.find((entry) => entry.slug === params.category)?.label ?? null)
        : null;
    const sourceName =
      params.source !== null ? (getSourceBySlug(params.source)?.name ?? null) : null;

    const baseArgs = {
      p_tokens: params.tokens.length > 0 ? params.tokens : null,
      p_district: params.district,
      p_category: categoryLabel,
      p_event_type: params.eventType,
      p_article_type: params.articleType,
      p_source: sourceName,
      p_language: params.language,
      p_year: params.year,
      p_limit: LIVE_PAGE_SIZE,
    };

    let offset = (params.page - 1) * LIVE_PAGE_SIZE;
    let page = params.page;
    const firstCall = await client.rpc("search_story_ids", {
      ...baseArgs,
      p_offset: offset,
    });
    if (firstCall.error) throw firstCall.error;
    let payload = firstCall.data as SearchIdsPayload | null;
    let total = Number(payload?.total ?? 0);
    let ids = (payload?.ids ?? []).map(Number);
    const totalPages = Math.max(1, Math.ceil(total / LIVE_PAGE_SIZE));
    page = Math.min(page, totalPages);

    if (ids.length === 0 && total > 0 && (params.page > totalPages || params.page < 1)) {
      // Hand-made out-of-range page: refetch the clamped window instead of
      // a separate head-count round trip.
      offset = (page - 1) * LIVE_PAGE_SIZE;
      const retryCall = await client.rpc("search_story_ids", {
        ...baseArgs,
        p_offset: offset,
      });
      if (retryCall.error) throw retryCall.error;
      payload = retryCall.data as SearchIdsPayload | null;
      total = Number(payload?.total ?? total);
      ids = (payload?.ids ?? []).map(Number);
    }

    let stories: PublicStory[] = [];
    if (ids.length > 0) {
      const { data, error } = await client
        .from("stories")
        .select(STORY_SELECT)
        .in("id", ids)
        .returns<StoryRow[]>();
      if (error) throw error;
      const byId = new Map(
        ((data ?? []) as StoryRow[]).map((row) => [Number(row.id), toPublicStory(row)])
      );
      // Hydration returns rows unordered — restore the SQL rank order.
      stories = ids
        .map((id) => byId.get(id))
        .filter((story): story is PublicStory => story !== undefined);
    }

    return {
      stories,
      page,
      totalPages,
      total,
      pageSize: LIVE_PAGE_SIZE,
      configured: true,
      demo: false,
      error: null,
    };
  } catch (error) {
    return emptyResult({
      configured: true,
      error: errorMessage(error),
    });
  }
}
