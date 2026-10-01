// Phase 29: the live feed row → reader story mapping, including the
// any-member-curated aggregation the Curated feed mode reads.
import { describe, expect, it } from "vitest";
import { toPublicStory } from "./feed";

function row(overrides: Partial<Parameters<typeof toPublicStory>[0]> = {}) {
  return {
    id: 1,
    canonical_title: "Cabinet approves Patna Metro expansion",
    primary_category: "Infrastructure",
    event_type: "approval",
    district_id: "patna",
    article_count: 5,
    source_count: 5,
    first_seen_at: "2026-09-28T10:00:00+05:30",
    last_seen_at: "2026-09-28T16:30:00+05:30",
    ...overrides,
  };
}

describe("Phase 29 — toPublicStory", () => {
  it("marks the story curated when any member article is curated", () => {
    const story = toPublicStory(
      row({
        story_articles: [
          { articles: { curated: false, language: null } },
          { articles: { curated: true, language: "en" } },
        ],
      })
    );
    expect(story.curated).toBe(true);
  });

  it("stays out of Curated when no member article is curated", () => {
    const story = toPublicStory(
      row({ story_articles: [{ articles: { curated: false, language: null } }] })
    );
    expect(story.curated).toBe(false);
  });

  it("treats missing members as not curated (honest default)", () => {
    expect(toPublicStory(row({ story_articles: null })).curated).toBe(false);
    expect(toPublicStory(row()).curated).toBe(false);
    expect(toPublicStory(row({ story_articles: [] })).curated).toBe(false);
  });

  it("maps district ids to canonical names and leaves unknown ones out", () => {
    expect(toPublicStory(row()).districtNames).toEqual(["Patna"]);
    expect(toPublicStory(row({ district_id: null })).districtNames).toEqual([]);
    expect(toPublicStory(row({ district_id: "nowhere" })).districtNames).toEqual([]);
  });

  it("aggregates member-article language coverage for the card", () => {
    expect(
      toPublicStory(
        row({
          story_articles: [
            { articles: { curated: true, language: "hi" } },
            { articles: { curated: true, language: "en" } },
            { articles: { curated: false, language: "hi" } }, // deduped
            { articles: { curated: false, language: null } }, // skipped
            { articles: null },
          ],
        })
      ).languages
    ).toEqual(["EN", "HI"]);
    expect(toPublicStory(row()).languages).toEqual([]);
  });
});
