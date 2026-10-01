import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTICLE_TYPES, EVENT_TYPES } from "@/lib/admin/options";
import Header from "@/components/public/Header";
import { DemoNotice, ErrorNotice, NotConfiguredNotice } from "@/components/public/Notices";
import StoryCard from "@/components/public/StoryCard";
import { CATEGORIES } from "@/lib/public/categories";
import { DISTRICTS, getDistrictBySlug } from "@/lib/public/districts";
import {
  MAX_QUERY_LENGTH,
  getSearch,
  hasSearchCriteria,
  parseSearchParams,
  type SearchParams,
} from "@/lib/public/search";
import { SOURCES } from "@/lib/public/sources";

// Search (Phase 34): the plan's archive search — query + plan filters,
// results server-paginated exactly like /archive so the browser only ever
// receives one window (no Elasticsearch; the SQL lives in the
// search_story_ids migration and this page just shapes it).
type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CARD = "glass-card p-4 sm:p-5 mb-4";

/** `_`-separated slugs → reader label ("construction_started" → "Construction
 * started") — presentation only; stored values never change. */
function humanize(slug: string): string {
  return slug
    .split("_")
    .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

const LANGUAGE_LABELS: Record<string, string> = { en: "English", hi: "Hindi" };

/** Deterministic search URLs: q, filters, page, demo. */
function searchHref(page: number, params: SearchParams): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.district) query.set("district", params.district);
  if (params.category) query.set("category", params.category);
  if (params.articleType) query.set("type", params.articleType);
  if (params.eventType) query.set("event", params.eventType);
  if (params.source) query.set("source", params.source);
  if (params.language) query.set("language", params.language);
  if (params.year !== null) query.set("year", String(params.year));
  if (page > 1) query.set("page", String(page));
  if (params.demo) query.set("demo", "1");
  const qs = query.toString();
  return qs ? `/search?${qs}` : "/search";
}

/** Applied filters as reader labels for the results summary. */
function appliedFilters(params: SearchParams): string[] {
  const labels: string[] = [];
  if (params.district) labels.push(getDistrictBySlug(params.district)?.name ?? params.district);
  if (params.category) {
    labels.push(
      CATEGORIES.find((entry) => entry.slug === params.category)?.label ?? params.category
    );
  }
  if (params.articleType) labels.push(humanize(params.articleType));
  if (params.eventType) labels.push(humanize(params.eventType));
  if (params.source)
    labels.push(SOURCES.find((entry) => entry.slug === params.source)?.name ?? params.source);
  if (params.language)
    labels.push(LANGUAGE_LABELS[params.language] ?? params.language.toUpperCase());
  if (params.year !== null) labels.push(String(params.year));
  return labels;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = parseSearchParams((await props.searchParams) ?? {});
  if (!params) return { title: "Search not found — PrōjectBihar Newsfeed" };
  return {
    title: params.q
      ? `Search: ${params.q} — PrōjectBihar Newsfeed`
      : "Search — PrōjectBihar Newsfeed",
    description:
      "Search story titles, articles, entities, districts, categories and sources across the archive.",
  };
}

export default async function SearchPage(props: PageProps) {
  const params = parseSearchParams((await props.searchParams) ?? {});
  if (!params) notFound();
  const data = await getSearch(params);

  const { stories, page, totalPages, total, pageSize } = data;
  const criteria = hasSearchCriteria(params);
  const filters = appliedFilters(params);
  const showEmpty = criteria && total === 0 && (data.configured || data.demo) && !data.error;
  const fixtureNoArticleTypes = params.demo && params.articleType !== null;
  const clearParams: SearchParams = {
    q: "",
    tokens: [],
    district: null,
    category: null,
    articleType: null,
    eventType: null,
    source: null,
    language: null,
    year: null,
    page: 1,
    demo: params.demo,
  };

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
          href={params.demo ? "/archive?demo=1" : "/archive"}
          className="inline-block mb-4 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
          style={{ color: "var(--ink-secondary)" }}
        >
          ← Archive
        </Link>

        {/* Query + plan filters: server-rendered GET form, no client fetching */}
        <div className={CARD}>
          <h1
            className="text-[18px] sm:text-[22px] leading-[1.4] mb-1"
            style={{ color: "var(--ink)", fontWeight: 500 }}
          >
            Search
          </h1>
          <p className="text-[13px] mb-1" style={{ color: "var(--muted)" }}>
            {total} {total === 1 ? "story" : "stories"}
            {params.q ? ` for «${params.q}»` : ""}
            {filters.length > 0 ? ` · ${filters.join(" · ")}` : ""}
          </p>
          {!criteria && (
            <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
              Search story titles, article headlines, entities, districts, categories and sources —
              filter by date, district, category, article type, event type, source and language.
            </p>
          )}
          {criteria && params.tokens.length > 0 && (
            <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
              Headline matches rank first, then newest ({pageSize} per page, rendered on the
              server).
            </p>
          )}

          <form
            method="get"
            action="/search"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4"
          >
            {params.demo && <input type="hidden" name="demo" value="1" />}
            <label className="block sm:col-span-2 lg:col-span-4">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Query
              </span>
              <input
                type="text"
                name="q"
                maxLength={MAX_QUERY_LENGTH}
                defaultValue={params.q}
                placeholder="e.g. metro, Kosi flood, tender"
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              />
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                District
              </span>
              <select
                name="district"
                defaultValue={params.district ?? ""}
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              >
                <option value="">All districts</option>
                {DISTRICTS.map((district) => (
                  <option key={district.id} value={district.id}>
                    {district.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Category
              </span>
              <select
                name="category"
                defaultValue={params.category ?? ""}
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              >
                <option value="">All categories</option>
                {CATEGORIES.map((category) => (
                  <option key={category.slug} value={category.slug}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Article type
              </span>
              <select
                name="type"
                defaultValue={params.articleType ?? ""}
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              >
                <option value="">All types</option>
                {ARTICLE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {humanize(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Event
              </span>
              <select
                name="event"
                defaultValue={params.eventType ?? ""}
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              >
                <option value="">All events</option>
                {EVENT_TYPES.map((event) => (
                  <option key={event} value={event}>
                    {humanize(event)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Source
              </span>
              <select
                name="source"
                defaultValue={params.source ?? ""}
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              >
                <option value="">All sources</option>
                {SOURCES.map((source) => (
                  <option key={source.slug} value={source.slug}>
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span
                className="block text-[11px] uppercase tracking-wider font-semibold mb-1"
                style={{ color: "var(--muted)" }}
              >
                Language
              </span>
              <select
                name="language"
                defaultValue={params.language ?? ""}
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              >
                <option value="">All languages</option>
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
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
                min={1970}
                placeholder="2026"
                defaultValue={params.year !== null ? String(params.year) : ""}
                className="glass-input w-full px-3 py-1.5 text-[13px]"
                style={{ color: "var(--ink)" }}
              />
            </label>
            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="px-4 py-1.5 rounded-xl text-[13px] font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: "var(--accent)", color: "#fff" }}
              >
                Search
              </button>
              {criteria && (
                <Link
                  href={searchHref(1, clearParams)}
                  className="py-1.5 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
                  style={{ color: "var(--ink-secondary)" }}
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* One page window of results — plain server-rendered links */}
        {stories.length > 0 && (
          <div
            id="search-results"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-2 items-stretch"
          >
            {stories.map((story) => (
              <div key={story.id} className="h-full">
                <StoryCard story={story} demo={params.demo} />
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <nav
            aria-label="Search result pages"
            className="flex items-center justify-between mt-4 mb-2 text-[13px] font-medium"
          >
            {page > 1 ? (
              <Link
                href={searchHref(page - 1, params)}
                className="transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--ink-secondary)" }}
              >
                ← Previous
              </Link>
            ) : (
              <span style={{ color: "var(--muted)" }}>← Previous</span>
            )}
            <span style={{ color: "var(--muted)" }}>
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={searchHref(page + 1, params)}
                className="transition-colors hover:text-[var(--accent)]"
                style={{ color: "var(--ink-secondary)" }}
              >
                Next →
              </Link>
            ) : (
              <span style={{ color: "var(--muted)" }}>Next →</span>
            )}
          </nav>
        )}

        {/* Honest empty state — never fake results */}
        {showEmpty && (
          <div className={CARD}>
            <p className="text-[13.5px]" style={{ color: "var(--ink-secondary)" }}>
              {params.q ? `No stories match «${params.q}».` : "No stories match these filters."}
            </p>
            <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
              Try fewer words or clear a filter.
            </p>
            {fixtureNoArticleTypes && (
              <p className="text-[12.5px] mt-1" style={{ color: "var(--muted)" }}>
                The demo fixture carries no article-type labels, so the article-type filter matches
                nothing in the fixture view (it filters live stories).
              </p>
            )}
            <Link
              href={searchHref(1, clearParams)}
              className="inline-block mt-2 text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
              style={{ color: "var(--ink-secondary)" }}
            >
              Clear search
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
