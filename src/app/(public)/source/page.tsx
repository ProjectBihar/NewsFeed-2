import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/public/Header";
import { SOURCES } from "@/lib/public/sources";

// Source index (Phase 32): one link per active registry source — navigation
// only, no counts or statistics of its own. Inactive registry entries are
// not listed (their pages 404 — the gate is "each active source has a
// stable public page").
export const metadata: Metadata = {
  title: "Sources — PrōjectBihar Newsfeed",
  description: "Source archives — one page per active source.",
};

export default async function SourceIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = ((await searchParams) ?? {}).demo === "1";
  const archiveHref = (slug: string) => `/source/${slug}${demo ? "?demo=1" : ""}`;

  return (
    <div>
      <Header />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-[105px] py-3 sm:py-4">
        <Link
          href={demo ? "/?demo=1" : "/"}
          className="inline-block mb-4 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          ← Latest
        </Link>

        <div className="glass-card p-4 sm:p-5 mb-4">
          <h1
            className="text-[18px] sm:text-[22px] leading-[1.4] mb-1"
            style={{ color: "var(--ink)", fontWeight: 500 }}
          >
            Sources
          </h1>
          <p className="text-[13px] mb-5" style={{ color: "var(--muted)" }}>
            All {SOURCES.length} active sources. Each page shows the source facts, its recent Bihar
            coverage, and the latest stories it reported.
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
            {SOURCES.map((source) => (
              <li key={source.slug}>
                <Link
                  href={archiveHref(source.slug)}
                  className="block py-1 text-[13.5px] transition-colors hover:text-[var(--accent)]"
                  style={{ color: "var(--ink)" }}
                >
                  {source.name}
                  <span className="text-[12px] ml-2" style={{ color: "var(--muted)" }}>
                    {source.language.toUpperCase()} · {source.scope}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
