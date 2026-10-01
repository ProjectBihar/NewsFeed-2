import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/public/Header";
import { DemoNotice, ErrorNotice, NotConfiguredNotice } from "@/components/public/Notices";
import StoryCard from "@/components/public/StoryCard";
import { getArchive, parseArchiveParams, type ArchiveParams } from "@/lib/public/archive";

// Archive (Phase 33): server-paginated stories ordered by first report,
// with date-based queries (`/archive?year=2026&month=09`). Each request
// renders exactly one page window — the browser never receives the full
// archive (the plan's rule for replacing V1's latest-200 limitation).
type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function filterLabel(params: ArchiveParams): string | null {
  if (params.month) return `${MONTH_NAMES[Number(params.month) - 1]} ${params.year}`;
  if (params.year !== null) return String(params.year);
  return null;
}

/** Deterministic pagination/filter URLs: year, month, page, demo. */
function archiveHref(page: number, params: ArchiveParams): string {
  const query = new URLSearchParams();
  if (params.year !== null) query.set("year", String(params.year));
  if (params.month) query.set("month", params.month);
  if (page > 1) query.set("page", String(page));
  if (params.demo) query.set("demo", "1");
  const qs = query.toString();
  return qs ? `/archive?${qs}` : "/archive";
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = parseArchiveParams((await props.searchParams) ?? {});
  if (!params) return { title: "Archive not found — PrōjectBihar Newsfeed" };
  const label = filterLabel(params);
  return {
    title: label ? `Archive: ${label} — PrōjectBihar Newsfeed` : "Archive — PrōjectBihar Newsfeed",
    description: "Every archived story, paginated by first report.",
  };
}

const CARD = "glass-card p-4 sm:p-5 mb-4";

export default async function ArchivePage(props: PageProps) {
  const params = parseArchiveParams((await props.searchParams) ?? {});
  if (!params) notFound();
  const data = await getArchive(params);

  const { stories, page, totalPages, total, pageSize } = data;
  const label = filterLabel(params);
  const showEmpty = total === 0 && (data.configured || data.demo) && !data.error;

  const notice = data.demo ? (
    <DemoNotice />
  ) : !data.configured ? (
    <NotConfiguredNotice />
  ) : data.error ? (
    <ErrorNotice message={data.error} />
  ) : undefined;

  const clearParams: ArchiveParams = { ...params, year: null, month: null, page: 1 };

  return (
    <div>
      <Header totalStories={stories.length} />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-[105px] py-3 sm:py-4">
        {notice && <div className="mb-3 sm:mb-4">{notice}</div>}

        <Link
          href={params.demo ? "/?demo=1" : "/"}
          className="inline-block mb-4 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          ← Latest
        </Link>

        {/* Archive header: real totals for the applied filter */}
        <div className={CARD}>
          <h1
            className="text-[18px] sm:text-[22px] leading-[1.4] mb-1"
            style={{ color: "var(--ink)", fontWeight: 500 }}
          >
            Archive
          </h1>
          <p className="text-[13px] mb-1" style={{ color: "var(--muted)" }}>
            {total} {total === 1 ? "story" : "stories"}
            {label ? ` · ${label}` : ""}
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
            Ordered by first report. Pages are rendered on the server ({pageSize} stories at a time)
            — the full history never loads at once.
          </p>
          <p className="text-[12.5px] mt-1">
            <Link
              href={params.demo ? "/search?demo=1" : "/search"}
              className="font-medium transition-colors hover:text-[var(--accent)]"
              style={{ color: "var(--ink-secondary)" }}
            >
              Search the archive →
            </Link>
          </p>

          {/* Date-based query (plan: /archive?year=2026&month=09) */}
          <form method="get" action="/archive" className="flex flex-wrap items-end gap-3 mt-4">
            {params.demo && <input type="hidden" name="demo" value="1" />}
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Year
              </span>
              <input
                type="number"
                name="year"
                required
                min={1970}
                placeholder="2026"
                defaultValue={params.year !== null ? String(params.year) : ""}
                className="glass-input px-3 py-1.5 text-[13px] w-24"
                style={{ color: "var(--ink)" }}
              />
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Month
              </span>
              <select
                name="month"
                defaultValue={params.month ?? ""}
                className="glass-input px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              >
                <option value="">All months</option>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={String(index + 1).padStart(2, "0")}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl text-[13px] font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              Apply
            </button>
            {label && (
              <Link
                href={archiveHref(1, clearParams)}
                className="py-1.5 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--ink-secondary)" }}
              >
                Clear filter
              </Link>
            )}
          </form>
        </div>

        {/* One page window of stories */}
        {stories.length > 0 && (
          <div
            id="archive-stories"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-2 items-stretch"
          >
            {stories.map((story) => (
              <div key={story.id} className="h-full">
                <StoryCard story={story} demo={params.demo} />
              </div>
            ))}
          </div>
        )}

        {/* Server-side pagination — plain links, no client fetching */}
        {totalPages > 1 && (
          <nav
            aria-label="Archive pages"
            className="flex items-center justify-between mt-4 mb-2 text-[13px] font-medium"
          >
            {page > 1 ? (
              <Link
                href={archiveHref(page - 1, params)}
                className="transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--ink-secondary)" }}
              >
                ← Newer
              </Link>
            ) : (
              <span style={{ color: "var(--muted)" }}>← Newer</span>
            )}
            <span style={{ color: "var(--muted)" }}>
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={archiveHref(page + 1, params)}
                className="transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--ink-secondary)" }}
              >
                Older →
              </Link>
            ) : (
              <span style={{ color: "var(--muted)" }}>Older →</span>
            )}
          </nav>
        )}

        {/* Honest empty state — never fake statistics */}
        {showEmpty && (
          <div className={CARD}>
            <p className="text-[13.5px]" style={{ color: "var(--ink-secondary)" }}>
              {label ? `No stories recorded for ${label} yet.` : "No stories recorded yet."}
            </p>
            <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
              Check back after the next crawl cycle.
            </p>
            {label && (
              <Link
                href={archiveHref(1, clearParams)}
                className="inline-block mt-2 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--ink-secondary)" }}
              >
                ← Browse all months
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
