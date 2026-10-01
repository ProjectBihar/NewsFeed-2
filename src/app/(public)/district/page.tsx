import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/public/Header";
import { DISTRICTS } from "@/lib/public/districts";

// District index (Phase 31): one link per district from the canonical
// 38-district dataset — navigation only, no counts or statistics of its own.
export const metadata: Metadata = {
  title: "Districts — PrōjectBihar Newsfeed",
  description: "District archives across Bihar — one page per district.",
};

export default async function DistrictIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = ((await searchParams) ?? {}).demo === "1";
  const archiveHref = (id: string) => `/district/${id}${demo ? "?demo=1" : ""}`;

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
            Districts
          </h1>
          <p className="text-[13px] mb-5" style={{ color: "var(--muted)" }}>
            All {DISTRICTS.length} Bihar districts. Each archive lists the latest developments and
            recent stories filed to that district.
          </p>

          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
            {DISTRICTS.map((district) => (
              <li key={district.id}>
                <Link
                  href={archiveHref(district.id)}
                  className="block py-1 text-[13.5px] transition-colors hover:text-[var(--accent)]"
                  style={{ color: "var(--ink)" }}
                >
                  {district.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
