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
  sourceDomain: string,
  options: { include_pattern?: string | null; allow_pdf?: boolean } = {}
): DiscoveryEntry[] {
  const $ = load(html);
  const entries: DiscoveryEntry[] = [];
  const seen = new Set<string>();
  const include = options.include_pattern ? new RegExp(options.include_pattern) : null;

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
    const officialCdn =
      options.allow_pdf &&
      host.endsWith(".s3waas.gov.in") &&
      absolute.pathname.toLowerCase().endsWith(".pdf");
    if (host !== sourceDomain && !host.endsWith(`.${sourceDomain}`) && !officialCdn) return;

    const path = absolute.pathname.toLowerCase();
    const ext = path.slice(path.lastIndexOf("."));
    if (path.includes(".") && ASSET_EXTENSIONS.has(ext) && !(ext === ".pdf" && options.allow_pdf))
      return;
    if (EXCLUDED_PATH_HINTS.some((hint) => path.includes(hint))) return;

    absolute.hash = "";
    const url = absolute.toString();
    if (url === pageUrl || (include && !include.test(url))) return;
    if (seen.has(url)) return;
    seen.add(url);
    const cells = $(el)
      .closest("tr")
      .find("td")
      .map((_, td) => $(td).text().trim())
      .get();
    const noticeTitle = [...cells].sort((a, b) => b.length - a.length)[0];
    const dateCell = cells.find(
      (t) => /^\d{1,2}\s+[A-Za-z]{3}\s+\d{4}$/.test(t) || /^\d{2}\/\d{2}\/\d{4}$/.test(t)
    );
    const dateText = dateCell?.includes("/") ? dateCell.split("/").reverse().join("-") : dateCell;
    const parsedDate = dateText ? new Date(dateText + " 00:00:00 GMT+0530") : null;
    entries.push({
      url,
      publishedAt: parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null,
      title: ($(el).text().trim() || noticeTitle || "").slice(0, 300) || null,
      via: "section",
    });
  });

  return entries;
}
