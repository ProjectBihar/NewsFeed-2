import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import Header from "@/components/public/Header";
import { DemoNotice, ErrorNotice, NotConfiguredNotice } from "@/components/public/Notices";
import StoryCard from "@/components/public/StoryCard";
import { getDistrict } from "@/lib/public/district";
import { slugForSourceName } from "@/lib/public/sources";
import { formatStamp } from "@/lib/public/time-ago";

// District archive (Phase 31): latest developments (article geography),
// recent stories (story geography), topic distribution, and source
// coverage — every count real and sampled; districts without coverage
// render an honest empty state and no statistics at all.
type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function readArgs({ params, searchParams }: PageProps): Promise<readonly [string, boolean]> {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  return [slug, sp.demo === "1"] as const;
}

// One lookup per request even though the page and metadata both need it.
const getDistrictCached = cache((slug: string, demo: boolean) => getDistrict(slug, { demo }));

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const [slug, demo] = await readArgs(props);
  const data = await getDistrictCached(slug, demo);
  if (!data) return { title: "District not found — PrōjectBihar Newsfeed" };
  return {
    title: `${data.district.name} district — PrōjectBihar Newsfeed`,
    description: `Latest developments, recent stories, and source coverage for ${data.district.name} district.`,
  };
}

const CARD = "glass-card p-4 sm:p-5 mb-4";
const SECTION_LABEL = "text-[12px] font-semibold uppercase tracking-wider mb-4";

export default async function DistrictPage(props: PageProps) {
  const [slug, demo] = await readArgs(props);
  const data = await getDistrictCached(slug, demo);
  if (!data) notFound();

  const { district, stories, developments, sourceCoverage, samples } = data;
  const noCoverage = stories.length === 0 && developments.length === 0;
  const showEmpty = (data.configured || data.demo) && !data.error && noCoverage;

  const notice = data.demo ? (
    <DemoNotice />
  ) : !data.configured ? (
    <NotConfiguredNotice />
  ) : data.error ? (
    <ErrorNotice message={data.error} />
  ) : undefined;

  return (
    <div>
      <Header totalStories={stories.length} />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-[105px] py-3 sm:py-4">
        {notice && <div className="mb-3 sm:mb-4">{notice}</div>}

        <Link
          href={demo ? "/district?demo=1" : "/district"}
          className="inline-block mb-4 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          ← All districts
        </Link>

        {/* District header */}
        <div className={CARD}>
          <div
            className="text-[11px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: "var(--muted)" }}
          >
            District archive
          </div>
          <h1
            className="text-[18px] sm:text-[22px] leading-[1.4]"
            style={{ color: "var(--ink)", fontWeight: 500 }}
          >
            {district.name}
          </h1>
        </div>

        {/* Latest developments — article geography, newest first */}
        {developments.length > 0 && (
          <section className={CARD} aria-label="Latest developments">
            <h2 className={SECTION_LABEL} style={{ color: "var(--muted)" }}>
              Latest developments
            </h2>
            <ul>
              {developments.map((development, index) => (
                <li
                  key={`${development.headline}-${index}`}
                  className="py-2.5 border-b border-[var(--border)] last:border-b-0"
                >
                  {development.url ? (
                    <a
                      href={development.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[13.5px] font-medium transition-opacity hover:opacity-70"
                      style={{ color: "var(--ink)" }}
                    >
                      {development.headline}
                    </a>
                  ) : (
                    <span
                      className="block text-[13.5px] font-medium"
                      style={{ color: "var(--ink)" }}
                    >
                      {development.headline}
                    </span>
                  )}
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
                    {development.sourceName} ·{" "}
                    {formatStamp(development.publishedAt) ?? "time unknown"}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recent stories — story geography, newest activity first */}
        {stories.length > 0 && (
          <section className={CARD} aria-label="Recent stories">
            <h2 className={SECTION_LABEL} style={{ color: "var(--muted)" }}>
              Recent stories
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {stories.map((story) => (
                <div key={story.id} className="h-full">
                  <StoryCard story={story} demo={demo} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Source coverage — only over articles that exist */}
        {sourceCoverage.length > 0 && (
          <section className={CARD} aria-label="Source coverage">
            <h2 className={SECTION_LABEL} style={{ color: "var(--muted)" }}>
              Source coverage
            </h2>
            <p className="text-[12px] -mt-2 mb-2" style={{ color: "var(--muted)" }}>
              Across {samples.articles} recent {samples.articles === 1 ? "article" : "articles"}
            </p>
            <ul>
              {sourceCoverage.map((source) => {
                // Link to the source archive when the name is an active
                // registry source; unknown names stay plain text rather
                // than a guessed URL or dead link (Phase 32).
                const sourceSlug = slugForSourceName(source.name);
                return (
                  <li
                    key={source.name}
                    className="flex items-center justify-between py-2 border-b border-[var(--border)] last:border-b-0 text-[13.5px]"
                  >
                    {sourceSlug ? (
                      <Link
                        href={`/source/${sourceSlug}${demo ? "?demo=1" : ""}`}
                        className="transition-colors hover:text-[var(--accent)]"
                        style={{ color: "var(--ink)" }}
                      >
                        {source.name}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--ink)" }}>{source.name}</span>
                    )}
                    <span style={{ color: "var(--muted)" }}>
                      {source.count} {source.count === 1 ? "article" : "articles"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Honest empty state — never fake statistics */}
        {showEmpty && (
          <div className={CARD}>
            <p className="text-[13.5px]" style={{ color: "var(--ink-secondary)" }}>
              No coverage recorded for {district.name} yet.
            </p>
            <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
              Check back after the next crawl cycle.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
