// Section-page link discovery (Phase 4, last-resort channel).
//
// Generic and conservative: same-registrable-domain links only, obvious
// asset/auth/gallery paths excluded. Publisher-specific rules belong to
// Phase 7 adapters, not here.
import { load } from "cheerio";
import type { DiscoveryEntry } from "./types";

const ASSET_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".css",
  ".js",
  ".mp4",
  ".mp3",
  ".webm",
  ".woff",
  ".woff2",
  ".ttf",
  ".pdf",
  ".zip",
]);

const EXCLUDED_PATH_HINTS = [
  "/login",
  "/signin",
  "/signup",
  "/register",
  "/subscribe",
  "/account",
  "/video/",
  "/videos/",
  "/photo/",
  "/photos/",
  "/gallery/",
  "/galleries/",
  "/live-tv",
  "/epaper",
];

/** Extract candidate article URLs from section HTML. No article fetch. */
export function parseSection(
  html: string,
  pageUrl: string,
  sourceDomain: string
): DiscoveryEntry[] {
  const $ = load(html);
  const entries: DiscoveryEntry[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_, el) => {
    const href = ($(el).attr("href") ?? "").trim();
    if (!href || href.startsWith("#")) return;
    let absolute: URL;
    try {
      absolute = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") return;
    const host = absolute.hostname.toLowerCase();
    if (host !== sourceDomain && !host.endsWith(`.${sourceDomain}`)) return;

    const path = absolute.pathname.toLowerCase();
    const ext = path.slice(path.lastIndexOf("."));
    if (path.includes(".") && ASSET_EXTENSIONS.has(ext)) return;
    if (EXCLUDED_PATH_HINTS.some((hint) => path.includes(hint))) return;

    absolute.hash = "";
    const url = absolute.toString();
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({
      url,
      publishedAt: null,
      title: $(el).text().trim().slice(0, 200) || null,
      via: "section",
    });
  });

  return entries;
}
