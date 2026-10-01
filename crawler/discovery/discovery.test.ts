import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { parseFeed } from "./parse-feed";
import { parseSitemap } from "./parse-sitemap";
import { parseWordPress } from "./parse-wordpress";
import { parseSection } from "./parse-section";
import { discoverSource, orderEndpoints, type Fetcher } from "./discover";
import { buildEnqueueQuery, type QueueRow } from "../queues/enqueue";
import type { DiscoveryEndpoint } from "./types";

const FIX = join(process.cwd(), "crawler", "discovery", "fixtures");
const read = (f: string) => readFileSync(join(FIX, f), "utf8");

describe("feed/sitemap/wordpress/section parsers (Phase 4)", () => {
  it("parses RSS items with dates, keeping raw tracked URLs", () => {
    const entries = parseFeed(read("rss-sample.xml"), "https://news.example.com/", "rss");
    expect(entries).toHaveLength(4);
    expect(entries[0].url).toBe("https://news.example.com/bihar/cabinet-approves-test-project-101");
    expect(entries[0].publishedAt?.toISOString()).toContain("2026-09-28");
    expect(entries[1].url).toContain("utm_source=rss");
    expect(entries[0].title).toBe("Bihar Cabinet approves test project");
  });

  it("parses Atom entries with alternate links", () => {
    const entries = parseFeed(read("atom-sample.xml"), "https://news.example.com/", "atom");
    expect(entries).toHaveLength(2);
    expect(entries[0].url).toBe("https://news.example.com/bihar/bpsc-calendar-201");
    expect(entries[0].publishedAt).not.toBeNull();
  });

  it("returns [] for non-XML without throwing", () => {
    expect(parseFeed("<html>nope", "https://x.example/", "rss")).toEqual([]);
  });

  it("parses news sitemaps with publication dates and undated URLs", () => {
    const { entries, children } = parseSitemap(
      read("news-sitemap-sample.xml"),
      "https://news.example.com/news-sitemap.xml",
      "news_sitemap"
    );
    expect(children).toEqual([]);
    expect(entries).toHaveLength(3);
    expect(entries[0].publishedAt?.toISOString()).toContain("2026-09-28");
    expect(entries[0].title).toBe("BIADA allots plots at Bihta industrial park");
    expect(entries[2].publishedAt).toBeNull();
  });

  it("follows same-origin index children and drops cross-origin ones", () => {
    const { entries, children } = parseSitemap(
      read("sitemap-index-sample.xml"),
      "https://news.example.com/sitemap.xml",
      "sitemap"
    );
    expect(entries).toEqual([]);
    expect(children).toEqual(["https://news.example.com/sitemap-day1.xml"]);
  });

  it("parses WordPress posts, skipping linkless drafts", () => {
    const entries = parseWordPress(read("wp-posts-sample.json"));
    expect(entries).toHaveLength(2);
    expect(entries[0].title).toBe("BPSC teacher recruitment round two");
    expect(entries[1].url).toContain("solar-pumps-402");
  });

  it("extracts same-domain section links, dropping junk", () => {
    const entries = parseSection(
      read("section-sample.html"),
      "https://news.example.com/bihar/",
      "news.example.com"
    );
    const urls = entries.map((e) => e.url);
    expect(urls).toContain("https://news.example.com/bihar/patna-metro-expansion-102");
    expect(urls).toContain(
      "https://news.example.com/bihar/ganga-ghat-cleanup-202?utm_campaign=section"
    );
    expect(urls).toContain("https://news.example.com/bihar/solar-pumps-402/amp/");
    expect(urls).toHaveLength(3);
  });
});

describe("endpoint ordering (Phase 4)", () => {
  it("polls RSS before sitemap before section", () => {
    const eps = [
      { endpoint_type: "section", url: "s", priority: "high" },
      { endpoint_type: "sitemap", url: "m", priority: "low" },
      { endpoint_type: "rss", url: "r", priority: "low" },
    ] as DiscoveryEndpoint[];
    expect(orderEndpoints(eps).map((e) => e.endpoint_type)).toEqual(["rss", "sitemap", "section"]);
  });
});

describe("discoverSource orchestration (Phase 4)", () => {
  const stubFetcher: Fetcher = async (url) => {
    if (url.endsWith("/feed")) {
      return { status: 200, contentType: "application/rss+xml", text: read("rss-sample.xml") };
    }
    if (url.endsWith("/bihar/")) {
      return { status: 200, contentType: "text/html", text: read("section-sample.html") };
    }
    return { status: 404, contentType: "text/html", text: "nope" };
  };

  const endpoints: DiscoveryEndpoint[] = [
    {
      endpoint_type: "rss",
      url: "https://news.example.com/feed",
      priority: "high",
      last_seen_url: "https://news.example.com/bihar/old-story-100",
      last_seen_published_at: null,
    },
    {
      endpoint_type: "section",
      url: "https://news.example.com/bihar/",
      priority: "medium",
      last_seen_url: null,
      last_seen_published_at: null,
    },
  ];

  it("discovers, checkpoints, normalises and dedupes without article fetch", async () => {
    const result = await discoverSource(
      { id: 7, domain: "news.example.com", priority: "high" },
      endpoints,
      { fetcher: stubFetcher, now: new Date("2026-09-28T12:00:00Z") }
    );

    expect(result.endpointResults).toHaveLength(2);
    expect(result.endpointResults.every((r) => r.ok)).toBe(true);
    // RSS stops at the remembered URL: 2 fresh of 4 listed.
    expect(result.checkpoints["https://news.example.com/feed"].last_seen_url).toBe(
      "https://news.example.com/bihar/cabinet-approves-test-project-101"
    );
    // Metro URL appears in both RSS (tracked) and section (relative):
    // canonical dedupe keeps one queue row.
    const canonicals = result.queueRows.map((r) => r.canonical_url);
    expect(new Set(canonicals).size).toBe(canonicals.length);
    expect(canonicals).toContain("https://news.example.com/bihar/patna-metro-expansion-102");
    expect(result.queueRows.every((r) => r.status === "discovered")).toBe(true);
    expect(result.queueRows.every((r) => r.source_id === 7)).toBe(true);
    expect(result.deferred).toBe(0);
  });

  it("caps intake at the safety limit and defers the remainder", async () => {
    const many = Array.from(
      { length: 300 },
      (_, i) =>
        `<item><title>T${i}</title><link>https://news.example.com/a/${i}</link>` +
        `<pubDate>Sun, 28 Sep 2026 10:00:00 +0530</pubDate></item>`
    ).join("");
    const big: Fetcher = async () => ({
      status: 200,
      contentType: "application/rss+xml",
      text: `<?xml version="1.0"?><rss version="2.0"><channel>${many}</channel></rss>`,
    });
    const result = await discoverSource(
      { id: 7, domain: "news.example.com", priority: "high" },
      [
        {
          endpoint_type: "rss",
          url: "https://news.example.com/feed",
          priority: "high",
          last_seen_url: null,
          last_seen_published_at: null,
        },
      ],
      { fetcher: big, maxUrls: 250 }
    );
    expect(result.discovered).toBe(250);
    expect(result.deferred).toBe(50);
    expect(result.queueRows).toHaveLength(250);
  });

  it("tolerates a dead endpoint without losing the healthy one", async () => {
    const flaky: Fetcher = async (url) => {
      if (url.endsWith("/feed")) return { status: 500, contentType: "", text: "" };
      return stubFetcher(url);
    };
    const result = await discoverSource(
      { id: 7, domain: "news.example.com", priority: "high" },
      endpoints,
      { fetcher: flaky }
    );
    expect(result.endpointResults[0].ok).toBe(false);
    expect(result.endpointResults[0].error).toBe("http-500");
    expect(result.endpointResults[1].ok).toBe(true);
    expect(result.checkpoints["https://news.example.com/feed"]).toBeUndefined();
    expect(result.queueRows.length).toBeGreaterThan(0);
  });
});

describe("enqueue persistence (Phase 4, PGlite)", () => {
  it("inserts discovered rows and ignores re-discovered duplicates", async () => {
    const db = new PGlite();
    const migrations = readdirSync(join(process.cwd(), "supabase", "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of migrations) {
      await db.exec(readFileSync(join(process.cwd(), "supabase", "migrations", f), "utf8"));
    }
    await db.query(
      `INSERT INTO sources (name, domain, language, scope) VALUES ('Q', 'q.example', 'en', 'bihar')`
    );
    const src = await db.query<{ id: number }>(`SELECT id FROM sources WHERE domain = 'q.example'`);
    const rows: QueueRow[] = [
      {
        url: "https://q.example/a?utm_source=rss",
        canonical_url: "https://q.example/a",
        source_id: src.rows[0].id,
        discovery_method: "rss",
        status: "discovered",
        priority: "high",
      },
      {
        url: "https://q.example/b",
        canonical_url: "https://q.example/b",
        source_id: src.rows[0].id,
        discovery_method: "section",
        status: "discovered",
        priority: "medium",
      },
    ];
    const q = buildEnqueueQuery(rows);
    await db.query(q.text, q.values as Array<string | number>);
    // Re-poll rediscovers both; conflicts drop them silently.
    await db.query(q.text, q.values as Array<string | number>);
    const count = await db.query<{ count: string }>(
      `SELECT count(*) FROM crawl_queue WHERE source_id = ${src.rows[0].id}`
    );
    expect(Number(count.rows[0].count)).toBe(2);
    await db.close();
  });
});
