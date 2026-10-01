// RSS 2.0 + Atom feed parsing (Phase 4). Pure function over XML text.
import { XMLParser } from "fast-xml-parser";
import type { DiscoveryEntry, EndpointType } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // Always arrays so single-item feeds parse identically to multi-item ones.
  isArray: (tag) => ["item", "entry", "link"].includes(tag),
});

export function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const t = Date.parse(value.trim());
  return Number.isNaN(t) ? null : new Date(t);
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value != null && typeof value === "object") {
    const v = (value as Record<string, unknown>)["#text"];
    if (typeof v === "string") return v.trim() || null;
  }
  return null;
}

function linkHref(link: unknown): string | null {
  if (typeof link === "string") return link.trim() || null;
  if (Array.isArray(link)) {
    // RSS forces <link> into an array: take the first text node.
    for (const l of link) {
      if (typeof l === "string" && l.trim()) return l.trim();
    }
    // Atom: prefer rel="alternate", else first href.
    const tagged = link.filter(
      (l): l is Record<string, unknown> => typeof l === "object" && l !== null && "@_href" in l
    );
    const alt = tagged.find((l) => l["@_rel"] === "alternate" || !l["@_rel"]);
    const pick = alt ?? tagged[0];
    if (pick && typeof pick["@_href"] === "string") {
      return (pick["@_href"] as string).trim() || null;
    }
    return null;
  }
  if (typeof link === "object" && link !== null) {
    const rec = link as Record<string, unknown>;
    if (typeof rec["@_href"] === "string") {
      return (rec["@_href"] as string).trim() || null;
    }
    return text(link);
  }
  return null;
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Parse RSS 2.0 or Atom XML into discovery entries (raw URLs, newest first as listed). */
export function parseFeed(xml: string, baseUrl: string, via: EndpointType): DiscoveryEntry[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const entries: DiscoveryEntry[] = [];

  const rss = doc["rss"] as Record<string, unknown> | undefined;
  const channel = rss?.["channel"] as Record<string, unknown> | undefined;
  const items = (channel?.["item"] ?? []) as Array<Record<string, unknown>>;
  for (const item of items) {
    const raw = linkHref(item["link"]) ?? text(item["guid"]);
    if (!raw) continue;
    const url = raw.startsWith("http") ? raw : resolveUrl(raw, baseUrl);
    if (!url) continue;
    entries.push({
      url,
      publishedAt: parseDate(item["pubDate"] ?? item["date"]),
      title: text(item["title"]),
      via,
    });
  }

  const feed = doc["feed"] as Record<string, unknown> | undefined;
  const atomEntries = (feed?.["entry"] ?? []) as Array<Record<string, unknown>>;
  for (const entry of atomEntries) {
    const raw = linkHref(entry["link"]);
    if (!raw) continue;
    const url = resolveUrl(raw, baseUrl);
    if (!url) continue;
    entries.push({
      url,
      publishedAt: parseDate(entry["published"] ?? entry["updated"]),
      title: text(entry["title"]),
      via,
    });
  }

  return entries;
}
