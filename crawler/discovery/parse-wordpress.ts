// WordPress REST API parsing (Phase 4): GET <site>/wp-json/wp/v2/posts.
import type { DiscoveryEntry } from "./types";
import { parseDate } from "./parse-feed";

interface WpPost {
  link?: unknown;
  date?: unknown;
  modified?: unknown;
  title?: { rendered?: unknown } | unknown;
}

/** Parse a wp-json posts payload into discovery entries. */
export function parseWordPress(
  json: string,
  via: "wordpress_api" = "wordpress_api"
): DiscoveryEntry[] {
  let posts: unknown;
  try {
    posts = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(posts)) return [];
  const entries: DiscoveryEntry[] = [];
  for (const raw of posts as WpPost[]) {
    if (typeof raw?.link !== "string" || !raw.link.trim()) continue;
    let title: string | null = null;
    const t = raw.title;
    if (t != null && typeof t === "object" && "rendered" in t) {
      const r = (t as { rendered?: unknown }).rendered;
      title = typeof r === "string" ? r.trim() || null : null;
    }
    entries.push({
      url: raw.link.trim(),
      publishedAt: parseDate(raw.date ?? raw.modified),
      title,
      via,
    });
  }
  return entries;
}
