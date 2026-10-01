// Sitemap parsing (Phase 4): <urlset> (incl. Google News namespace) and
// <sitemapindex>. Child sitemaps are followed one level, same-origin only.
import { XMLParser } from "fast-xml-parser";
import type { DiscoveryEntry } from "./types";
import { parseDate } from "./parse-feed";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (tag) => ["url", "sitemap"].includes(tag),
});

export interface ParsedSitemap {
  entries: DiscoveryEntry[];
  /** Child sitemap URLs when the document is an index. */
  children: string[];
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return null;
}

export function parseSitemap(
  xml: string,
  baseUrl: string,
  via: "news_sitemap" | "sitemap"
): ParsedSitemap {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return { entries: [], children: [] };
  }

  const entries: DiscoveryEntry[] = [];
  const urlset = doc["urlset"] as Record<string, unknown> | undefined;
  const urls = (urlset?.["url"] ?? []) as Array<Record<string, unknown>>;
  for (const u of urls) {
    const loc = text(u["loc"]);
    if (!loc) continue;
    let absolute: string;
    try {
      absolute = new URL(loc, baseUrl).toString();
    } catch {
      continue;
    }
    const news = u["news:news"] as Record<string, unknown> | undefined;
    entries.push({
      url: absolute,
      publishedAt: parseDate(news?.["news:publication_date"] ?? u["lastmod"] ?? u["news:lastmod"]),
      title: text((news?.["news:title"] as unknown) ?? u["news:title"]) ?? null,
      via,
    });
  }

  const children: string[] = [];
  const index = doc["sitemapindex"] as Record<string, unknown> | undefined;
  const maps = (index?.["sitemap"] ?? []) as Array<Record<string, unknown>>;
  for (const m of maps) {
    const loc = text(m["loc"]);
    if (!loc) continue;
    try {
      const absolute = new URL(loc, baseUrl).toString();
      // Same-origin only: never let an index bounce the crawler elsewhere.
      if (new URL(absolute).origin === new URL(baseUrl).origin) {
        children.push(absolute);
      }
    } catch {
      continue;
    }
  }

  return { entries, children };
}
