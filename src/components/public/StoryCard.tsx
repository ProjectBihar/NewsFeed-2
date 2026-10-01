import Link from "next/link";
import { categoryColor } from "@/lib/public/categories";
import { timeAgo } from "@/lib/public/time-ago";
import type { PublicStory } from "@/lib/public/types";

/**
 * V1 news card (Phase 28) carrying a V2 story: the same glass card,
 * category badge, headline typography, and muted meta row as V1's NewsCard,
 * with sentiment buttons, category correction, and per-article links removed.
 * Meta row: district · time on the left, sources · languages on the right —
 * per the plan's story-card example. The headline links to the story page
 * (Phase 30), carrying `?demo=1` when serving fixture stories.
 */
export default function StoryCard({ story, demo = false }: { story: PublicStory; demo?: boolean }) {
  const color = story.primaryCategory ? categoryColor(story.primaryCategory) : null;

  const time = timeAgo(story.lastSeenAt);
  const left = story.districtNames.length ? `${story.districtNames.join(", ")} · ${time}` : time;
  const languages = story.languages.length ? ` · ${story.languages.join(" + ")}` : "";
  const href = `/story/${story.id}${demo ? "?demo=1" : ""}`;

  return (
    <article className="glass-card p-4 sm:p-5 flex flex-col relative gpu-accel">
      {/* Category badge — V1 pill styling and colour */}
      <div className="flex items-center gap-2 mb-3">
        {story.primaryCategory && color && (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: `${color}0A`,
              color: `${color}bb`,
              border: `1px solid ${color}15`,
            }}
          >
            {story.primaryCategory}
          </span>
        )}
      </div>

      {/* Canonical headline — links to the story page */}
      <h3
        className="text-[14.5px] sm:text-[15px] font-normal leading-[1.5] mb-3 flex-1"
        style={{ color: "var(--ink)" }}
      >
        <Link href={href} className="hover:underline decoration-from-font">
          {story.canonicalTitle}
        </Link>
      </h3>

      {/* Bottom row — separated by spacing, no divider line */}
      <div className="flex items-center justify-between mt-auto pt-3 gap-2">
        <span
          className="text-[11px] sm:text-[12px] leading-tight min-w-0 truncate flex-shrink"
          style={{ color: "var(--muted)" }}
        >
          {left}
        </span>
        <span
          className="text-[11px] sm:text-[12px] leading-tight flex-shrink-0"
          style={{ color: "var(--muted)" }}
        >
          {story.sourceCount} source{story.sourceCount === 1 ? "" : "s"}
          {languages}
        </span>
      </div>
    </article>
  );
}
