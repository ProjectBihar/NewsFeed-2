import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import Header from "@/components/public/Header";
import { DemoNotice } from "@/components/public/Notices";
import { slugForDistrictName } from "@/lib/public/districts";
import { getStory } from "@/lib/public/story";
import { formatStamp, timeAgo } from "@/lib/public/time-ago";

// Public story page (Phase 30): the structure behind a clustered
// development. Reports link out to the original publishers; article bodies
// are never republished. `?demo=1` serves the reviewed fixture stories.

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function readArgs({ params, searchParams }: PageProps): Promise<readonly [string, boolean]> {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  return [id, sp.demo === "1"] as const;
}

// One lookup per request even though the page and metadata both need it —
// keyed on primitives so React cache can share across the two callers.
const getStoryCached = cache((id: string, demo: boolean) => getStory(id, { demo }));

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const [id, demo] = await readArgs(props);
  const story = await getStoryCached(id, demo);
  if (!story) return { title: "Story not found — PrōjectBihar Newsfeed" };
  const facts = [
    `${story.sourceCount} source${story.sourceCount === 1 ? "" : "s"}`,
    story.languages.join(" + "),
    story.districtNames.join(", "),
  ].filter(Boolean);
  return {
    title: `${story.canonicalTitle} — PrōjectBihar Newsfeed`,
    description: facts.join(" · "),
  };
}

const CARD = "glass-card p-4 sm:p-5 mb-4";
const SECTION_LABEL = "text-[12px] font-semibold uppercase tracking-wider mb-4";

export default async function StoryPage(props: PageProps) {
  const [id, demo] = await readArgs(props);
  const story = await getStoryCached(id, demo);
  if (!story) notFound();

  const firstReported = formatStamp(story.firstSeenAt) ?? "—";
  const latestStamp = formatStamp(story.lastSeenAt);
  const latestUpdate = latestStamp
    ? `${latestStamp} (${timeAgo(story.lastSeenAt)})`
    : timeAgo(story.lastSeenAt);
  const facts: Array<{ label: string; value: ReactNode }> = [
    {
      label: "Location",
      // Districts link into the Phase 31 archives (keeping the demo flag).
      value: story.districtNames.length ? (
        <>
          {story.districtNames.map((name, index) => {
            const slug = slugForDistrictName(name);
            return (
              <span key={name}>
                {index > 0 && ", "}
                {slug ? (
                  <Link
                    href={`/district/${slug}${story.demo ? "?demo=1" : ""}`}
                    className="hover:underline"
                  >
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </span>
            );
          })}
        </>
      ) : (
        "—"
      ),
    },
    { label: "First reported", value: firstReported },
    { label: "Latest update", value: latestUpdate },
    {
      label: "Sources",
      value: `${story.sourceCount} source${story.sourceCount === 1 ? "" : "s"}`,
    },
    {
      label: "Languages",
      value: story.languages.length ? story.languages.join(" + ") : "—",
    },
  ];

  return (
    <div>
      <Header />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-[105px] py-3 sm:py-4">
        {story.demo && (
          <div className="mb-3 sm:mb-4">
            <DemoNotice />
          </div>
        )}

        <Link
          href={story.demo ? "/?demo=1" : "/"}
          className="inline-block mb-4 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          ← Latest
        </Link>

        {/* Headline + facts */}
        <article className={CARD}>
          <h1
            className="text-[18px] sm:text-[22px] leading-[1.4] mb-5"
            style={{ color: "var(--ink)", fontWeight: 500 }}
          >
            {story.canonicalTitle}
          </h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {facts.map((fact) => (
              <div key={fact.label}>
                <div
                  className="text-[11px] uppercase tracking-wider font-semibold"
                  style={{ color: "var(--muted)" }}
                >
                  {fact.label}
                </div>
                <div className="text-[13.5px] mt-0.5" style={{ color: "var(--ink)" }}>
                  {fact.value}
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Reports — provenance: who reported when, each linking to the
            original publisher. Bodies stay with their publishers. */}
        <section className={CARD} aria-label="Reports">
          <h2 className={SECTION_LABEL} style={{ color: "var(--muted)" }}>
            Reports
          </h2>
          {story.reports.length === 0 ? (
            <p className="text-[13.5px]" style={{ color: "var(--muted)" }}>
              No reports recorded yet.
            </p>
          ) : (
            <ul>
              {story.reports.map((report, index) => {
                const stamp = formatStamp(report.publishedAt) ?? "time unknown";
                const row = (
                  <>
                    <span className="font-medium" style={{ color: "var(--ink)" }}>
                      {report.sourceName}
                    </span>
                    <span className="text-[12px] flex-shrink-0" style={{ color: "var(--muted)" }}>
                      {stamp}
                    </span>
                  </>
                );
                return (
                  <li
                    key={`${report.sourceName}-${report.publishedAt}-${index}`}
                    className="py-2.5 border-b border-[var(--border)] last:border-b-0"
                  >
                    {report.url ? (
                      <a
                        href={report.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-4 text-[13.5px] transition-opacity hover:opacity-70"
                      >
                        {row}
                      </a>
                    ) : (
                      <span className="flex items-center justify-between gap-4 text-[13.5px]">
                        {row}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Entities */}
        {story.entities.length > 0 && (
          <section className={CARD} aria-label="Entities">
            <h2 className={SECTION_LABEL} style={{ color: "var(--muted)" }}>
              Entities
            </h2>
            <div className="flex flex-wrap gap-2">
              {story.entities.map((entity) => (
                <span
                  key={entity}
                  className="inline-flex items-center px-3 py-1 rounded-full text-[12px] font-medium"
                  style={{
                    backgroundColor: "var(--pill-bg)",
                    border: "1px solid var(--border)",
                    color: "var(--ink-secondary)",
                  }}
                >
                  {entity}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
