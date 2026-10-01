import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import Header from "@/components/public/Header";
import { DemoNotice, ErrorNotice, NotConfiguredNotice } from "@/components/public/Notices";
import StoryCard from "@/components/public/StoryCard";
import { getDistrictBySlug } from "@/lib/public/districts";
import { getSource } from "@/lib/public/source";
import { formatStamp } from "@/lib/public/time-ago";

// Source archive (Phase 32): the plan's public fields — source name,
// language, scope, source type, recent Bihar coverage, latest
// stories/articles — over registry facts and real sampled coverage.
// Crawler diagnostics (endpoints, verification, priority, wave, notes)
// never render here; they belong in admin (plan rule).
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
const getSourceCached = cache((slug: string, demo: boolean) => getSource(slug, { demo }));

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const [slug, demo] = await readArgs(props);
  const data = await getSourceCached(slug, demo);
  if (!data) return { title: "Source not found — PrōjectBihar Newsfeed" };
  return {
    title: `${data.source.name} — PrōjectBihar Newsfeed`,
    description: `Latest stories and recent Bihar coverage from ${data.source.name}.`,
  };
}

const CARD = "glass-card p-4 sm:p-5 mb-4";
const SECTION_LABEL = "text-[12px] font-semibold uppercase tracking-wider mb-4";

export default async function SourcePage(props: PageProps) {
  const [slug, demo] = await readArgs(props);
  const data = await getSourceCached(slug, demo);
  if (!data) notFound();

  const { source, articles, stories, coverage } = data;
  const showEmpty =
    coverage === null && (data.configured || data.demo) && !data.error && stories.length === 0;

  const notice = data.demo ? (
    <DemoNotice />
  ) : !data.configured ? (
    <NotConfiguredNotice />
  ) : data.error ? (
    <ErrorNotice message={data.error} />
  ) : undefined;

  const sampleLabel = coverage
    ? data.demo
      ? `Across the ${coverage.sample}-article fixture corpus`
      : `Across ${coverage.sample} recent ${coverage.sample === 1 ? "article" : "articles"}`
    : null;

  return (
    <div>
      <Header totalStories={stories.length} />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-[105px] py-3 sm:py-4">
        {notice && <div className="mb-3 sm:mb-4">{notice}</div>}

        <Link
          href={demo ? "/source?demo=1" : "/source"}
          className="inline-block mb-4 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          ← All sources
        </Link>

        {/* Source header: the plan's static public fields */}
        <div className={CARD}>
          <div
            className="text-[11px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: "var(--muted)" }}
          >
            Source archive
          </div>
          <h1
            className="text-[18px] sm:text-[22px] leading-[1.4]"
            style={{ color: "var(--ink)", fontWeight: 500 }}
          >
            {/* Registry-verified homepage — the same provenance link story
                report rows use; never a guessed URL. */}
            <a
              href={`https://${source.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-70"
            >
              {source.name}
            </a>
          </h1>
          <dl className="grid grid-cols-3 gap-3 mt-3">
            <div>
              <dt
                className="text-[11px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted)" }}
              >
                Language
              </dt>
              <dd className="text-[13.5px] mt-0.5" style={{ color: "var(--ink)" }}>
                {source.language.toUpperCase()}
              </dd>
            </div>
            <div>
              <dt
                className="text-[11px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted)" }}
              >
                Scope
              </dt>
              <dd className="text-[13.5px] mt-0.5" style={{ color: "var(--ink)" }}>
                {source.scope}
              </dd>
            </div>
            <div>
              <dt
                className="text-[11px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--muted)" }}
              >
                Source type
              </dt>
              <dd className="text-[13.5px] mt-0.5" style={{ color: "var(--ink)" }}>
                {source.sourceType}
              </dd>
            </div>
          </dl>
        </div>

        {/* Recent Bihar coverage — real counts over the stated sample */}
        {coverage && sampleLabel && (
          <section className={CARD} aria-label="Recent Bihar coverage">
            <h2 className={SECTION_LABEL} style={{ color: "var(--muted)" }}>
              Recent Bihar coverage
            </h2>
            <p className="text-[12px] -mt-2 mb-4" style={{ color: "var(--muted)" }}>
              {sampleLabel}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: coverage.articles, label: "articles" },
                { value: coverage.stories, label: "stories" },
                { value: coverage.districts, label: "districts" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-[22px] leading-tight" style={{ color: "var(--ink)" }}>
                    {stat.value}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--muted)" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Latest articles — publisher rows, bodies never republished */}
        {articles.length > 0 && (
          <section className={CARD} aria-label="Latest articles">
            <h2 className={SECTION_LABEL} style={{ color: "var(--muted)" }}>
              Latest articles
            </h2>
            <ul>
              {articles.map((article, index) => (
                <li
                  key={`${article.headline}-${index}`}
                  className="py-2.5 border-b border-[var(--border)] last:border-b-0"
                >
                  {article.url ? (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-[13.5px] font-medium transition-opacity hover:opacity-70"
                      style={{ color: "var(--ink)" }}
                    >
                      {article.headline}
                    </a>
                  ) : (
                    <span
                      className="block text-[13.5px] font-medium"
                      style={{ color: "var(--ink)" }}
                    >
                      {article.headline}
                    </span>
                  )}
                  <div className="text-[12px] mt-0.5" style={{ color: "var(--muted)" }}>
                    {formatStamp(article.publishedAt) ?? "time unknown"}
                    {article.districts.map((slugName) => {
                      const district = getDistrictBySlug(slugName);
                      if (!district) return null;
                      return (
                        <span key={slugName}>
                          {" · "}
                          <Link
                            href={`/district/${district.id}${demo ? "?demo=1" : ""}`}
                            className="transition-colors hover:text-[var(--accent)]"
                          >
                            {district.name}
                          </Link>
                        </span>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recent stories — stories with a member article by this source */}
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

        {/* Honest empty state — never fake statistics */}
        {showEmpty && (
          <div className={CARD}>
            <p className="text-[13.5px]" style={{ color: "var(--ink-secondary)" }}>
              No coverage recorded for {source.name} yet.
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
