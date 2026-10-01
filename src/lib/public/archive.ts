// Archive reads (Phase 33): replaces V1's latest-200 limit (PBNews
// `page.tsx` fetches `.limit(200)`) with server-side pagination and
// date-based queries — `/archive?year=2026&month=09`.
//
// Rules:
// - The archive is ordered by first-reported time (a story belongs to
//   exactly one month), with an id tiebreak so offset pages stay stable.
// - Only one page window ever crosses the wire: demo slices the fixture
//   through the same `paginate` function the live path's semantics mirror;
//   live fetches a PostgREST `.range()` window with an exact count — the
//   browser never receives the full archive (plan: "Do not load the entire
//   archive into the browser").
// - Params parse strictly: syntactically valid dates render (an honest
//   empty month is a valid answer); malformed values return null so the
//   page 404s instead of guessing.
import { getSupabaseClient, isSupabaseConfigured } from "../supabase";
import { DEMO_STORIES } from "./demo-stories";
import { STORY_SELECT, toPublicStory, type StoryRow } from "./feed";
import type { PublicStory } from "./types";

/** Fixture window: the 12-story corpus spans two demo pages so pagination
 *  is exercisable end-to-end; the live window is the production size. */
export const DEMO_PAGE_SIZE = 8;
export const LIVE_PAGE_SIZE = 20;

export interface ArchiveParams {
  year: number | null;
  /** Zero-padded month ("01".."12"); implies `year` (parse enforces). */
  month: string | null;
  page: number;
  demo: boolean;
}

export interface ArchivePageData {
  /** The page window only — never the whole archive. */
  stories: PublicStory[];
  /** Requested page, clamped into [1, totalPages]. */
  page: number;
  totalPages: number;
  /** Total stories matching the filter (across all pages). */
  total: number;
  pageSize: number;
  configured: boolean;
  demo: boolean;
  error: string | null;
}

export interface PageWindow<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

/** Server-side pagination: copies only the requested page (a `slice`, not
 *  a re-materialisation of the archive) and clamps out-of-range pages. */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): PageWindow<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(Math.max(1, page), totalPages);
  const start = (clamped - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: clamped, totalPages, total };
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

/** Strict archive query parsing; null → the page 404s. Month requires a
 *  year (the form's year input is `required`, so only hand-made URLs can
 *  produce the combination). */
export function parseArchiveParams(
  sp: Record<string, string | string[] | undefined>
): ArchiveParams | null {
  const yearField = readField(sp, "year");
  const monthField = readField(sp, "month");
  const pageField = readField(sp, "page");
  if (yearField.invalid || monthField.invalid || pageField.invalid) return null;

  let year: number | null = null;
  if (yearField.value !== null) {
    if (!/^\d{4}$/.test(yearField.value)) return null;
    year = Number(yearField.value);
  }

  let month: string | null = null;
  if (monthField.value !== null) {
    if (!/^\d{1,2}$/.test(monthField.value)) return null;
    const monthNumber = Number(monthField.value);
    if (monthNumber < 1 || monthNumber > 12) return null;
    if (year === null) return null; // ambiguous without a year
    month = String(monthNumber).padStart(2, "0");
  }

  let page = 1;
  if (pageField.value !== null) {
    if (!/^\d+$/.test(pageField.value)) return null;
    page = Number(pageField.value);
    if (page < 1) return null;
  }

  return { year, month, page, demo: sp.demo === "1" };
}

/** Newest first; ties broken by id descending so pages never shuffle. */
function byFirstSeenDesc(a: PublicStory, b: PublicStory): number {
  if (a.firstSeenAt !== b.firstSeenAt) return a.firstSeenAt < b.firstSeenAt ? 1 : -1;
  return String(b.id).localeCompare(String(a.id));
}

function demoArchive(params: ArchiveParams, configured: boolean): ArchivePageData {
  let stories = [...DEMO_STORIES];
  if (params.year !== null) {
    // Fixture stamps are Bihar time (+05:30), so the ISO prefix is the
    // archive bucket: "2026" for a year filter, "2026-09" for a month.
    const prefix = params.month ? `${params.year}-${params.month}` : String(params.year);
    stories = stories.filter((story) => story.firstSeenAt.slice(0, prefix.length) === prefix);
  }
  stories.sort(byFirstSeenDesc);
  const window = paginate(stories, params.page, DEMO_PAGE_SIZE);
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

/** Archive month boundaries in Bihar time (IST, no DST — matches every
 *  stored timestamp's +05:30 offset). */
function archiveBounds(year: number, month: string | null): { start: string; end: string } {
  const start = month ? `${year}-${month}-01T00:00:00+05:30` : `${year}-01-01T00:00:00+05:30`;
  const end = !month
    ? `${year + 1}-01-01T00:00:00+05:30`
    : month === "12"
      ? `${year + 1}-01-01T00:00:00+05:30`
      : `${year}-${String(Number(month) + 1).padStart(2, "0")}-01T00:00:00+05:30`;
  return { start, end };
}

function emptyArchive(overrides: Partial<ArchivePageData> = {}): ArchivePageData {
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

/** One archive page. Params arrive pre-validated by `parseArchiveParams`. */
export async function getArchive(params: ArchiveParams): Promise<ArchivePageData> {
  if (params.demo) return demoArchive(params, isSupabaseConfigured());

  const client = getSupabaseClient();
  if (!client) return emptyArchive();

  try {
    const bounds = params.year !== null ? archiveBounds(params.year, params.month) : null;
    const query = () => {
      const q = client
        .from("stories")
        .select(STORY_SELECT, { count: "exact" })
        .order("first_seen_at", { ascending: false })
        .order("id", { ascending: false });
      return bounds ? q.gte("first_seen_at", bounds.start).lt("first_seen_at", bounds.end) : q;
    };
    const fetchWindow = (page: number) => {
      const from = (page - 1) * LIVE_PAGE_SIZE;
      return query().range(from, from + LIVE_PAGE_SIZE - 1);
    };

    let result = await fetchWindow(params.page);
    if (result.error) throw result.error;
    const total = result.count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / LIVE_PAGE_SIZE));
    const page = Math.min(params.page, totalPages);
    if (page !== params.page && total > 0) {
      // Out-of-range request: refetch the clamped last page instead of a
      // second head-count round trip.
      result = await fetchWindow(page);
      if (result.error) throw result.error;
    }

    return {
      stories: ((result.data ?? []) as unknown as StoryRow[]).map(toPublicStory),
      page,
      totalPages,
      total,
      pageSize: LIVE_PAGE_SIZE,
      configured: true,
      demo: false,
      error: null,
    };
  } catch (error) {
    return emptyArchive({
      configured: true,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
