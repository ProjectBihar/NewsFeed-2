"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import CategoryTabs from "./CategoryTabs";
import FeedSwitcher from "./FeedSwitcher";
import Header from "./Header";
import SiteNav from "./SiteNav";
import StoryCard from "./StoryCard";
import { countByMode, selectStories, type FeedMode } from "@/lib/public/feed-modes";
import type { PublicStory } from "@/lib/public/types";

/**
 * Public feed shell (Phase 28/29): V1's page structure — sticky header,
 * centred 1200px container, Curated/All feed modes (plan §54, default
 * Curated), category pill strip, three-column glass-card grid — over V2
 * stories. Phase 29 adds the plan's section nav above the switcher; the
 * header count follows the visible list, as in V1. Category pills filter
 * within Curated only (V1 behaviour: tabs are hidden in All mode).
 */
export default function Newsfeed({
  stories,
  notice,
  demo = false,
}: {
  stories: PublicStory[];
  notice?: ReactNode;
  /** True when serving `?demo=1` fixture stories — story links carry the flag. */
  demo?: boolean;
}) {
  const [mode, setMode] = useState<FeedMode>("curated");
  const [active, setActive] = useState("all");

  const counts = useMemo(() => countByMode(stories), [stories]);
  const filtered = useMemo(() => selectStories(stories, mode, active), [stories, mode, active]);

  const emptyHeading =
    mode === "curated" && active !== "all" ? "No stories in this category" : "No stories found";

  return (
    <div>
      <Header totalStories={filtered.length} />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-[105px] py-3 sm:py-4">
        {notice && <div className="mb-3 sm:mb-4">{notice}</div>}

        <SiteNav
          demo={demo}
          onTopics={() => {
            if (mode !== "curated") setMode("curated");
          }}
        />

        <FeedSwitcher mode={mode} onChange={setMode} counts={counts} />

        {mode === "curated" && <CategoryTabs active={active} onChange={setActive} />}

        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-2">{emptyHeading}</p>
            <p className="text-sm">Check back after the next crawl cycle.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-2 items-stretch">
            {filtered.map((story) => (
              <div key={story.id} className="animate-fade-in h-full">
                <StoryCard story={story} demo={demo} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
