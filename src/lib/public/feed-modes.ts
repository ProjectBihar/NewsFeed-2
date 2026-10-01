import type { PublicStory } from "./types";

/**
 * Feed modes (Phase 29): the plan's §54 public feed semantics as pure
 * functions over `PublicStory`.
 *
 * - Curated (default) contains stories whose classifier tier is A or selected
 *   B — recorded as `articles.curated`, aggregated per story in `feed.ts`.
 * - All Bihar News contains everything stored (A + B + C: routine crime,
 *   accidents, routine politics join the feed here).
 * - Category pills filter within Curated only, mirroring V1 (tabs are hidden
 *   in All mode and the category selection is ignored there).
 *
 * Both views sort newest-first by last activity.
 */
export type FeedMode = "curated" | "all";

export interface FeedCounts {
  curated: number;
  all: number;
}

export function isCuratedStory(story: PublicStory): boolean {
  return story.curated;
}

export function countByMode(stories: PublicStory[]): FeedCounts {
  return {
    curated: stories.filter(isCuratedStory).length,
    all: stories.length,
  };
}

function byLastSeenDesc(a: PublicStory, b: PublicStory): number {
  if (a.lastSeenAt < b.lastSeenAt) return 1;
  if (a.lastSeenAt > b.lastSeenAt) return -1;
  return 0;
}

/** The stories a reader sees for a given mode + category selection. */
export function selectStories(
  stories: PublicStory[],
  mode: FeedMode,
  activeCategory: string = "all"
): PublicStory[] {
  const base = mode === "curated" ? stories.filter(isCuratedStory) : stories;
  const narrowed =
    mode === "curated" && activeCategory !== "all"
      ? base.filter((story) => (story.primaryCategory ?? "").toLowerCase() === activeCategory)
      : base;
  return [...narrowed].sort(byLastSeenDesc);
}
