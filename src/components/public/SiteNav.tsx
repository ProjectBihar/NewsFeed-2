import Link from "next/link";

/**
 * Section navigation (Phase 29, plan information architecture; Phases
 * 31-33 completed it).
 *
 * Latest, Topics, Districts, Sources and Archive all work today (feed
 * root, the category pill strip, the district index, the source index,
 * and the server-paginated archive) — no disabled placeholders remain.
 * Demo mode carries `?demo=1` so navigation never drops the reader out of
 * the fixture view.
 */
export default function SiteNav({
  onTopics,
  demo = false,
}: {
  onTopics?: () => void;
  demo?: boolean;
}) {
  const homeHref = demo ? "/?demo=1" : "/";
  const districtHref = demo ? "/district?demo=1" : "/district";
  const sourceHref = demo ? "/source?demo=1" : "/source";
  const archiveHref = demo ? "/archive?demo=1" : "/archive";
  return (
    <nav
      aria-label="Sections"
      className="flex items-center gap-4 mb-3 text-[13px] font-medium overflow-x-auto scrollbar-hide whitespace-nowrap -mx-4 px-4 sm:mx-0 sm:px-0"
    >
      <Link
        href={homeHref}
        aria-current="page"
        className="transition-colors text-[var(--ink)] flex-shrink-0"
      >
        Latest
      </Link>
      <a
        href="#topics"
        onClick={(event) => {
          // The pill strip lives in Curated mode (V1 behaviour): make sure it
          // is on screen before scrolling to it, and keep the plain anchor as
          // the no-JS fallback.
          event.preventDefault();
          onTopics?.();
          requestAnimationFrame(() => {
            document
              .getElementById("topics")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
        className="transition-colors text-[var(--ink-secondary)] hover:text-[var(--accent)] flex-shrink-0"
      >
        Topics
      </a>
      <Link
        href={districtHref}
        className="transition-colors text-[var(--ink-secondary)] hover:text-[var(--accent)] flex-shrink-0"
      >
        Districts
      </Link>
      <Link
        href={sourceHref}
        className="transition-colors text-[var(--ink-secondary)] hover:text-[var(--accent)] flex-shrink-0"
      >
        Sources
      </Link>
      <Link
        href={archiveHref}
        className="transition-colors text-[var(--ink-secondary)] hover:text-[var(--accent)] flex-shrink-0"
      >
        Archive
      </Link>
    </nav>
  );
}
