import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  renderSeed,
  renderBrowserFlags,
  MIGRATION,
  BROWSER_FLAGS_MIGRATION,
  renderExpansion,
  EXPANSION_MIGRATION,
} from "../scripts/generate-source-seed.mjs";

const REGISTRY_PATH = join(process.cwd(), "data", "sources", "registry.json");
const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));

const SOURCE_TYPES = ["news", "official", "research", "institutional"];
const ENDPOINT_TYPES = ["rss", "atom", "news_sitemap", "sitemap", "wordpress_api", "section"];
const PRIORITIES = ["high", "medium", "low"];
const WAVES = ["A", "B", "C", "D"];

describe("Phase 3 source registry (static rules)", () => {
  it("declares known groups and waves", () => {
    expect(registry.version).toBe(2);
    expect(registry.groups).toContain("bihar-hindi");
    expect(registry.groups).toContain("district-local");
    expect(registry.groups).toContain("education");
    expect(registry.sources.length).toBeGreaterThanOrEqual(10);
  });

  it("gives every source a complete, schema-compatible record", () => {
    const domains = new Set<string>();
    const names = new Set<string>();
    for (const s of registry.sources) {
      for (const f of [
        "name",
        "domain",
        "language",
        "scope",
        "source_type",
        "priority",
        "group",
        "wave",
        "notes",
      ]) {
        expect(s[f], `${s.name}: ${f}`).toBeTruthy();
      }
      expect(typeof s.active).toBe("boolean");
      expect(typeof s.requires_browser).toBe("boolean");
      expect(SOURCE_TYPES).toContain(s.source_type);
      expect(PRIORITIES).toContain(s.priority);
      expect(registry.groups).toContain(s.group);
      expect(WAVES).toContain(s.wave);
      expect(domains.has(s.domain), `duplicate domain ${s.domain}`).toBe(false);
      expect(names.has(s.name), `duplicate name ${s.name}`).toBe(false);
      domains.add(s.domain);
      names.add(s.name);
      if (!s.active) {
        expect(s.notes, `${s.name}: inactive needs a reason`).toMatch(/inactive/i);
      }
      expect(
        Array.isArray(s.endpoints) && s.endpoints.length > 0,
        `${s.name}: at least one endpoint`
      ).toBe(true);
    }
  });

  it("registers only well-formed, same-domain https endpoints", () => {
    const urls = new Set<string>();
    for (const s of registry.sources) {
      let activeEndpoints = 0;
      for (const e of s.endpoints) {
        expect(ENDPOINT_TYPES).toContain(e.endpoint_type);
        expect(PRIORITIES).toContain(e.priority);
        expect(typeof e.active).toBe("boolean");
        expect(e.verification, `${e.url}: evidence`).toBeTruthy();
        const u = new URL(e.url);
        expect(u.protocol).toBe("https:");
        expect(
          u.hostname === s.domain ||
            u.hostname.endsWith(`.${s.domain}`) ||
            ((s.allowed_endpoint_hosts ?? []).includes(u.hostname) &&
              ["rss", "atom"].includes(e.endpoint_type)),
          `${e.url}: host must match domain ${s.domain}`
        ).toBe(true);
        expect(urls.has(e.url), `duplicate endpoint ${e.url}`).toBe(false);
        urls.add(e.url);
        if (e.active) activeEndpoints += 1;
      }
      if (s.active) {
        expect(
          activeEndpoints,
          `${s.name}: active source needs an active endpoint`
        ).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("keeps the committed seed migrations in sync with the generator", () => {
    const committed = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
    expect(renderSeed(registry)).toBe(committed);
    const committedFlags = readFileSync(BROWSER_FLAGS_MIGRATION, "utf8").replace(/\r\n/g, "\n");
    expect(renderBrowserFlags(registry)).toBe(committedFlags);
    expect(renderExpansion(registry)).toBe(
      readFileSync(EXPANSION_MIGRATION, "utf8").replace(/\r\n/g, "\n")
    );
  });
});

describe("Phase 3 source registry (database load)", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files).toContain("20260928000002_phase3_sources.sql");
    for (const f of files) {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
    }
  });

  it("loads every registry row", async () => {
    const sources = await db.query<{ count: string }>("SELECT count(*) FROM sources");
    expect(Number(sources.rows[0].count)).toBe(registry.sources.length);
    const endpoints = await db.query<{ count: string }>("SELECT count(*) FROM source_endpoints");
    const expectedEndpoints = registry.sources.reduce(
      (n: number, s: { endpoints: unknown[] }) => n + s.endpoints.length,
      0
    );
    expect(Number(endpoints.rows[0].count)).toBe(expectedEndpoints);
  });

  it("links every endpoint to a source with no orphans", async () => {
    const orphans = await db.query<{ count: string }>(
      `SELECT count(*) FROM source_endpoints e
       LEFT JOIN sources s ON s.id = e.source_id WHERE s.id IS NULL`
    );
    expect(Number(orphans.rows[0].count)).toBe(0);
  });

  it("spot-checks flagship Bihar coverage", async () => {
    const rows = await db.query<{ url: string; active: boolean }>(
      `SELECT e.url, e.active FROM source_endpoints e
       JOIN sources s ON s.id = e.source_id
       WHERE s.domain = 'prabhatkhabar.com' ORDER BY e.url`
    );
    expect(rows.rows.map((r) => r.url)).toContain("https://www.prabhatkhabar.com/state/bihar");
    expect(rows.rows.map((r) => r.url)).toContain("https://www.prabhatkhabar.com/news-sitemap.xml");
    expect(rows.rows.every((r) => r.active)).toBe(true);
  });
});
