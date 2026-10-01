// Phase 29 completion gate — part 1: the plan's feed-mode semantics (§54)
// as a partition benchmark over the reviewed Phase 16 fixture: Curated = tier
// A + selected B stories (9 of 12), All Bihar News = everything (12), default
// Curated, newest-first, category pills filtering Curated only.
import { describe, expect, it } from "vitest";
import { DEMO_STORIES } from "./demo-stories";
import { countByMode, selectStories, type FeedMode } from "./feed-modes";
import type { PublicStory } from "./types";

const CURATED_EXCLUDED = ["s-robbery", "s-rally", "s-cricket"];

function ids(stories: PublicStory[]): (string | number)[] {
  return stories.map((s) => s.id);
}

describe("Phase 29 — feed modes partition the fixture per plan §54", () => {
  it("counts 9 curated of 12 total", () => {
    expect(countByMode(DEMO_STORIES)).toEqual({ curated: 9, all: 12 });
  });

  it("Curated excludes routine crime, routine politics, and uncategorised sport", () => {
    const curated = selectStories(DEMO_STORIES, "curated");
    expect(curated).toHaveLength(9);
    for (const excluded of CURATED_EXCLUDED) {
      expect(ids(curated)).not.toContain(excluded);
    }
    // All Bihar News carries A + B + C — the same three appear there.
    const all = selectStories(DEMO_STORIES, "all");
    expect(all).toHaveLength(12);
    for (const excluded of CURATED_EXCLUDED) {
      expect(ids(all)).toContain(excluded);
    }
    // Curated is a strict subset of All.
    expect(ids(curated).every((id) => ids(all).includes(id))).toBe(true);
    // The flagship development story stays in the default feed.
    expect(ids(curated)).toContain("metro-approval");
  });

  it("both modes sort newest-first by last activity", () => {
    for (const mode of ["curated", "all"] satisfies FeedMode[]) {
      const stories = selectStories(DEMO_STORIES, mode);
      const sorted = [...stories].sort((a, b) =>
        a.lastSeenAt < b.lastSeenAt ? 1 : a.lastSeenAt > b.lastSeenAt ? -1 : 0
      );
      expect(ids(stories)).toEqual(ids(sorted));
      expect(stories[0].id).toBe("s-tender"); // 2026-10-28, newest fixture
    }
  });

  it("category pills filter within Curated only (V1 behaviour)", () => {
    const curatedInfra = selectStories(DEMO_STORIES, "curated", "infrastructure");
    expect(ids(curatedInfra).sort()).toEqual([
      "bridge-collapse",
      "metro-approval",
      "s-fares",
      "s-tender",
    ]);
    // In All mode the category selection is ignored, exactly as V1 did.
    expect(selectStories(DEMO_STORIES, "all", "infrastructure")).toHaveLength(12);
  });

  it("does not mutate the input list", () => {
    const before = ids(DEMO_STORIES);
    selectStories(DEMO_STORIES, "curated", "education");
    expect(ids(DEMO_STORIES)).toEqual(before);
  });
});
