import Link from "next/link";

/** Navigation carries demo mode through public archives. */
export default function SiteNav({ demo = false }: { demo?: boolean }) {
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
