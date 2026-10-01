import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { assessSourceHealth } from "./assess";
import { computeSourceMetrics, latestHealth, recordHealthCheck } from "./metrics";
import type { QueryFn } from "../fetch/queue-store";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function query(db: PGlite): QueryFn {
  return {
    query: async (text: string, values?: unknown[]) => {
      const res = await db.query(text, values as unknown[]);
      return { rows: res.rows as Record<string, unknown>[] };
    },
  };
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

async function seedSource(db: PGlite, name: string, domain: string): Promise<number> {
  await db.query(
    `INSERT INTO sources (name, domain, language, scope) VALUES ($1, $2, 'en', 'bihar')`,
    [name, domain]
  );
  const res = await db.query<{ id: number }>(`SELECT id FROM sources WHERE domain = $1`, [domain]);
  return (res.rows[0] as unknown as { id: number }).id;
}

async function seedEndpoint(
  db: PGlite,
  sourceId: number,
  url: string,
  checkedHoursAgo: number | null,
  successHoursAgo: number | null
): Promise<void> {
  await db.query(
    `INSERT INTO source_endpoints (source_id, endpoint_type, url, last_checked, last_success_at)
     VALUES ($1, 'rss', $2, $3, $4)`,
    [
      sourceId,
      url,
      checkedHoursAgo == null ? null : hoursAgo(checkedHoursAgo),
      successHoursAgo == null ? null : hoursAgo(successHoursAgo),
    ]
  );
}

async function seedQueue(
  db: PGlite,
  sourceId: number,
  prefix: string,
  count: number,
  status: string,
  lastError: string | null,
  attemptHoursAgo: number,
  discoveredHoursAgo: number,
  tag: string = "a"
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const url = `https://${prefix}.example/${tag}/${status}/${i}`;
    await db.query(
      `INSERT INTO crawl_queue (url, canonical_url, source_id, status, last_error, last_attempt_at, discovered_at)
       VALUES ($1, $1, $2, $3, $4, $5, $6)`,
      [url, sourceId, status, lastError, hoursAgo(attemptHoursAgo), hoursAgo(discoveredHoursAgo)]
    );
  }
}

async function check(db: PGlite, sourceId: number) {
  const q = query(db);
  const metrics = await computeSourceMetrics(q, sourceId, 24);
  const assessment = assessSourceHealth({
    sourceId,
    now: new Date().toISOString(),
    windowHours: 24,
    polls: metrics.polls,
    fetch: metrics.fetch,
    extraction: metrics.extraction,
    lastDiscoveryAt: metrics.lastDiscoveryAt,
  });
  const id = await recordHealthCheck(q, assessment, metrics);
  expect(id).toBeGreaterThan(0);
  return assessment.state;
}

describe("source health progression (Phase 19 gate, PGlite)", () => {
  it("moves HEALTHY -> DEGRADED -> BLOCKED -> DEGRADED as failures arrive and ease", async () => {
    const db = new PGlite();
    try {
      for (const f of readdirSync(MIGRATIONS_DIR)
        .filter((x) => x.endsWith(".sql"))
        .sort()) {
        await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
      }
      const sid = await seedSource(db, "Progress", "progress.example");
      await seedEndpoint(db, sid, "https://progress.example/feed", 0.5, 1);
      await seedQueue(db, sid, "progress", 10, "fetched", null, 1, 2);

      expect(await check(db, sid)).toBe("HEALTHY");
      await seedQueue(db, sid, "progress", 4, "failed", "http-500-server-error", 0.5, 2, "b");
      expect(await check(db, sid)).toBe("DEGRADED");
      await seedQueue(db, sid, "progress", 16, "blocked", "http-403-blocked", 0.25, 2, "c");
      expect(await check(db, sid)).toBe("BLOCKED");
      await seedQueue(db, sid, "progress", 20, "fetched", null, 0.1, 1, "d");
      expect(await check(db, sid)).toBe("DEGRADED");

      const latest = await latestHealth(query(db), sid);
      expect(latest?.health_state).toBe("DEGRADED");
      const rows = await db.query<{ diagnostics: unknown }>(
        `SELECT diagnostics FROM public.source_health WHERE source_id = $1 ORDER BY checked_at DESC LIMIT 1`,
        [sid]
      );
      const diagnostics = (rows.rows[0] as unknown as { diagnostics: { reasons: string[] } })
        .diagnostics;
      expect(diagnostics.reasons.length).toBeGreaterThan(0);
    } finally {
      await db.close();
    }
  }, 120000);

  it("reports BROKEN for failing polls and STALE for never-tried sources", async () => {
    const db = new PGlite();
    try {
      for (const f of readdirSync(MIGRATIONS_DIR)
        .filter((x) => x.endsWith(".sql"))
        .sort()) {
        await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
      }
      const broken = await seedSource(db, "Broken", "broken.example");
      await seedEndpoint(db, broken, "https://broken.example/a", 1, 72);
      await seedEndpoint(db, broken, "https://broken.example/b", 2, 72);
      await seedEndpoint(db, broken, "https://broken.example/c", 3, 72);
      expect(await check(db, broken)).toBe("BROKEN");

      const stale = await seedSource(db, "Stale", "stale.example");
      await seedEndpoint(db, stale, "https://stale.example/feed", null, null);
      expect(await check(db, stale)).toBe("STALE");
      expect(await latestHealth(query(db), stale)).toMatchObject({ health_state: "STALE" });
    } finally {
      await db.close();
    }
  }, 120000);
});
