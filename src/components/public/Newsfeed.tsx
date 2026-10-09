import type { ReactNode } from "react";
import Link from "next/link";
import Header from "./Header";
import SiteNav from "./SiteNav";
import StoryCard from "./StoryCard";
import TimelineRollover from "./TimelineRollover";
import { FEED_PAGE_SIZE, timelineHref } from "@/lib/public/timeline";
import type { PublicStory } from "@/lib/public/types";

export default function Newsfeed({
  stories,
  notice,
  demo = false,
  total = stories.length,
  page = 1,
  totalPages = 1,
  asOf = new Date().toISOString(),
}: {
  stories: PublicStory[];
  notice?: ReactNode;
  demo?: boolean;
  total?: number;
  page?: number;
  totalPages?: number;
  asOf?: string;
}) {
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  return (
    <div>
      {!demo && <TimelineRollover asOf={asOf} />}
      <Header totalStories={total} />
      <div className="newsfeed-shell">
        {notice && <div className="mb-3 sm:mb-4">{notice}</div>}
        <SiteNav demo={demo} />
        <section className="feed-introduction" aria-labelledby="feed-title">
          <p className="initiative-label">An independent public-interest initiative for Bihar</p>
          <h1 id="feed-title">Bihar News</h1>
          <p className="feed-description">
            A clearer view of Bihar’s public life. Reports from newsrooms and official sources,
            together in one place.
          </p>
        </section>
        <p className="timeline-caption">
          {demo ? "Demo seven-day window" : "Today and the previous six days"} · IST · {total}{" "}
          stories
          {total > 0 &&
            ` · Showing ${(page - 1) * FEED_PAGE_SIZE + 1}–${(page - 1) * FEED_PAGE_SIZE + stories.length}`}
        </p>
        {stories.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-2">No stories found</p>
            <p className="text-sm">Check back after the next crawl cycle.</p>
          </div>
        ) : (
          <div className="story-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-2 items-stretch">
            {stories.map((story) => (
              <div key={story.id} className="animate-fade-in h-full">
                <StoryCard story={story} demo={demo} />
              </div>
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <nav
            aria-label="News pagination"
            className="flex flex-wrap items-center justify-center gap-4 py-6 text-sm"
          >
            {page > 1 && (
              <Link prefetch={false} href={timelineHref(page - 1, asOf, demo)}>
                Previous
              </Link>
            )}
            {pages.map((p, i) => (
              <span key={p} className="flex gap-4">
                {i > 0 && p - pages[i - 1] > 1 && <span aria-hidden="true">…</span>}
                <Link
                  prefetch={false}
                  href={timelineHref(p, asOf, demo)}
                  aria-current={p === page ? "page" : undefined}
                >
                  {p}
                </Link>
              </span>
            ))}
            {page < totalPages && (
              <Link prefetch={false} href={timelineHref(page + 1, asOf, demo)}>
                Next
              </Link>
            )}
            <span style={{ color: "var(--muted)" }}>
              Page {page} of {totalPages}
            </span>
          </nav>
        )}
      </div>
    </div>
  );
}
