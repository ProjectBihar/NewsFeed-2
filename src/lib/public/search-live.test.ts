// Phase 34 live-path orchestration (the DB executes search_story_ids; here
// we verify everything around it): RPC argument shaping (slug → category
// label / source registry name, page windowing), hydration that restores
// the SQL rank order, out-of-range clamping via a second RPC, and honest
// error propagation. The SQL itself is executed and asserted at archive
// scale in tests/search-fn.test.ts (embedded PGlite).
import { describe, expect, it, vi } from "vitest";
import { getSearch, parseSearchParams } from "./search";

const state = vi.hoisted(() => ({
  rpcCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  rpcResult: null as { total: number; ids: number[] } | null,
  rpcError: null as { message: string } | null,
  hydrateRows: [] as unknown[],
  hydrateError: null as { message: string } | null,
}));

vi.mock("../supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ name, args });
      return { data: state.rpcResult, error: state.rpcError };
    },
    from: () => ({
      select: () => ({
        in: () => ({
          returns: async () => ({ data: state.hydrateRows, error: state.hydrateError }),
        }),
      }),
    }),
  }),
}));

function storyRow(id: number, title: string, firstSeen = "2026-09-28T10:00:00+05:30") {
  return {
    id,
    canonical_title: title,
    primary_category: "Infrastructure",
    event_type: "approval",
    district_id: "patna",
    article_count: 1,
    source_count: 1,
    first_seen_at: firstSeen,
    last_seen_at: firstSeen,
    story_articles: [{ articles: { curated: true, language: "hi" } }],
  };
}

function reset() {
  state.rpcCalls.length = 0;
  state.rpcResult = null;
  state.rpcError = null;
  state.hydrateRows = [];
  state.hydrateError = null;
}

describe("Phase 34 — live search orchestration", () => {
  it("shapes the RPC arguments and restores the SQL rank order after hydration", async () => {
    reset();
    state.rpcResult = { total: 45, ids: [3, 1, 2] };
    state.hydrateRows = [storyRow(2, "Two"), storyRow(3, "Three"), storyRow(1, "One")];

    const result = await getSearch(
      parseSearchParams({
        q: "metro tenders",
        district: "patna",
        category: "infrastructure",
        event: "approval",
        type: "development",
        source: "the-hindu",
        language: "hi",
        year: "2026",
        demo: "",
      })!
    );

    expect(result.configured).toBe(true);
    expect(result.error).toBeNull();
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    // Hydration came back unordered (2,3,1) — the SQL rank order wins.
    expect(result.stories.map((story) => story.id)).toEqual([3, 1, 2]);
    expect(result.stories[0]?.canonicalTitle).toBe("Three");

    expect(state.rpcCalls).toHaveLength(1);
    const call = state.rpcCalls[0];
    expect(call.name).toBe("search_story_ids");
    expect(call.args).toMatchObject({
      p_tokens: ["metro", "tenders"], // raw tokens; SQL normalises/escapes
      p_district: "patna",
      p_category: "Infrastructure", // slug → stored label
      p_event_type: "approval",
      p_article_type: "development",
      p_source: "The Hindu", // slug → registry/DB name
      p_language: "hi",
      p_year: 2026,
      p_limit: 20,
      p_offset: 0,
    });
  });

  it("windows offsets and clamps a hand-made out-of-range page with one refetch", async () => {
    reset();
    state.rpcResult = { total: 45, ids: [] };

    const beyond = await getSearch(parseSearchParams({ q: "metro", page: "99" })!);
    expect(beyond.page).toBe(3); // 45 stories / 20 per page → last page
    expect(beyond.total).toBe(45);
    expect(state.rpcCalls.map((call) => call.args.p_offset)).toEqual([1960, 40]);
    // No ids even after the clamped refetch → honest empty window, no error.
    expect(beyond.stories).toEqual([]);
    expect(beyond.error).toBeNull();

    // Normal second page: one RPC, no refetch.
    reset();
    state.rpcResult = { total: 45, ids: [45, 44] };
    state.hydrateRows = [storyRow(44, "Forty-four"), storyRow(45, "Forty-five")];
    const second = await getSearch(parseSearchParams({ q: "metro", page: "2" })!);
    expect(second.page).toBe(2);
    expect(second.stories.map((story) => story.id)).toEqual([45, 44]);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].args.p_offset).toBe(20);
  });

  it("propagates RPC and hydration errors honestly", async () => {
    reset();
    state.rpcError = { message: "function search_story_ids does not exist" };
    const rpcFailure = await getSearch(parseSearchParams({ q: "metro" })!);
    expect(rpcFailure.configured).toBe(true);
    expect(rpcFailure.error).toContain("search_story_ids");
    expect(rpcFailure.stories).toEqual([]);
    expect(rpcFailure.total).toBe(0);

    reset();
    state.rpcResult = { total: 1, ids: [7] };
    state.hydrateError = { message: "permission denied for table stories" };
    const hydrateFailure = await getSearch(parseSearchParams({ q: "metro" })!);
    expect(hydrateFailure.error).toContain("permission denied");
    expect(hydrateFailure.stories).toEqual([]);
  });
});
