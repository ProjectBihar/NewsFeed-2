import { load } from "cheerio";
import type { DiscoveryEntry } from "../crawler/discovery/types";
export function summaryHtml(entry: DiscoveryEntry, domain: string): string | null {
  const url = new URL(entry.url);
  if (url.hostname !== domain && !url.hostname.endsWith("." + domain)) return null;
  const body = load(entry.summary ?? "")
    .text()
    .trim();
  if (!entry.title || body.length < 50 || body.length > 20000) return null;
  const escape = (s: string) =>
    s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const date = entry.publishedAt?.toISOString();
  return `<html><head><title>${escape(entry.title)}</title><meta property="og:title" content="${escape(entry.title)}"><link rel="canonical" href="${escape(entry.url)}">${date ? `<meta property="article:published_time" content="${date}">` : ""}</head><body><article><h1>${escape(entry.title)}</h1><p>${escape(body)}</p></article></body></html>`;
}
