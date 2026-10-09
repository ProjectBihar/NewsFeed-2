import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  correctArticleAction,
  mergeStoriesAction,
  moveArticleAction,
  renameStoryAction,
  splitStoryAction,
} from "./actions";
import { requireAdmin } from "./require-auth";
import { requireClient } from "./queries";
import { correctArticle, mergeStories, moveArticle, renameStory, splitStory } from "./mutations";

vi.mock("./require-auth", () => ({ requireAdmin: vi.fn() }));
vi.mock("./queries", () => ({ requireClient: vi.fn(() => ({})) }));
vi.mock("./mutations", () => ({
  correctArticle: vi.fn(),
  mergeStories: vi.fn(),
  moveArticle: vi.fn(),
  renameStory: vi.fn(),
  splitStory: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(undefined);
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("admin action authorization and input boundaries", () => {
  it("denies every action before parsing input or obtaining a privileged client", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new Error("Admin access required."));
    for (const action of [
      correctArticleAction,
      mergeStoriesAction,
      moveArticleAction,
      renameStoryAction,
      splitStoryAction,
    ]) {
      await expect(action(new FormData())).rejects.toThrow("Admin access required.");
    }
    expect(requireClient).not.toHaveBeenCalled();
    for (const mutation of [correctArticle, mergeStories, moveArticle, renameStory, splitStory]) {
      expect(mutation).not.toHaveBeenCalled();
    }
  });

  it("rejects blank, non-positive, fractional and unsafe record identifiers", async () => {
    for (const id of ["", "0", "-1", "1.5", "1e2", "9007199254740992"]) {
      await expect(renameStoryAction(form({ storyId: id, title: "New title" }))).rejects.toThrow(
        "bad storyId"
      );
    }
    expect(renameStory).not.toHaveBeenCalled();
  });

  it("validates correction vocabularies and split members on the server", async () => {
    await expect(
      correctArticleAction(form({ articleId: "1", article_type: "invented" }))
    ).rejects.toThrow("bad article_type");
    const split = form({ storyId: "1", newTitle: "New story" });
    split.append("articleIds", "2");
    split.append("articleIds", "bad");
    await expect(splitStoryAction(split)).rejects.toThrow("bad articleIds");
    expect(correctArticle).not.toHaveBeenCalled();
    expect(splitStory).not.toHaveBeenCalled();
  });

  it("allows an authorized rename through the existing mutation contract", async () => {
    await renameStoryAction(
      form({ storyId: "7", title: "Reviewed title", reason: "Clarification" })
    );
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(renameStory).toHaveBeenCalledWith({}, 7, "Reviewed title", "Clarification");
  });
});
