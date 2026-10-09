import Link from "next/link";
import { formatStamp, timeAgo } from "@/lib/public/time-ago";
import type { PublicStory } from "@/lib/public/types";

/** Headline and provenance, without inferred topic labels. */
export default function StoryCard({ story, demo = false }: { story: PublicStory; demo?: boolean }) {
  const time = demo
    ? formatStamp(story.lastSeenAt)
    : `${story.dateVerified === false ? "First seen " : story.firstSeenAt !== story.lastSeenAt ? "Updated " : ""}${timeAgo(story.lastSeenAt)}`;
  const left = story.districtNames.length ? `${story.districtNames.join(", ")} · ${time}` : time;
  const languages = story.languages.length ? ` · ${story.languages.join(" + ")}` : "";
  const href = `/story/${story.id}${demo ? "?demo=1" : ""}`;

  return (
    <article className="glass-card p-4 sm:p-5 flex flex-col relative gpu-accel">
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
