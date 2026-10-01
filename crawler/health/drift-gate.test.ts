import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { checkSourceHealth } from "./drift";
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

async function migrate(db: PGlite): Promise<void> {
  for (const f of readdirSync(MIGRATIONS_DIR)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
}

async function seedSource(db: PGlite, name: string, domain: string): Promise<number> {
  await db.query(
    `INSERT INTO sources (name, domain, language, scope) VALUES ($1, $2, 'en', 'bihar')`,
    [name, domain]
  );
  const res = await db.query(`SELECT id FROM sources WHERE domain = $1`, [domain]);
  return (res.rows[0] as unknown as { id: number }).id;
}

describe("synthetic anomalies raise the expected alerts (Phase 20 gate, PGlite)", () => {
  it("flags a discovery collapse to zero", async () => {
    const db = new PGlite();
    try {
      await migrate(db);
      const sid = await seedSource(db, "Volume", "volume.example");
      await db.query(
        `INSERT INTO source_endpoints (source_id, endpoint_type, url, last_checked, last_success_at)
         VALUES ($1, 'rss', 'https://volume.example/feed', $2, $2)`,
        [sid, hoursAgo(1)]
      );
      // 14 healthy days at ~20/day, then nothing today.
      for (let day = 1; day <= 14; day++) {
        for (let i = 0; i < 20; i++) {
          const url = `https://volume.example/d${day}/${i}`;
          await db.query(
            `INSERT INTO crawl_queue (url, canonical_url, source_id, status, last_attempt_at, discovered_at)
             VALUES ($1, $1, $2, 'fetched', $3, $3)`,
            [url, sid, hoursAgo(day * 24 + 1)]
          );
        }
      }
      const { alerts } = await checkSourceHealth(query(db), sid, { windowHours: 24 });
      expect(alerts.map((a) => a.code)).toContain("DISCOVERY_VOLUME_ANOMALY");
      expect(alerts.find((a) => a.code === "DISCOVERY_VOLUME_ANOMALY")?.severity).toBe("critical");
    } finally {
      await db.close();
    }
  }, 180000);

  it("suspects parser drift on extraction collapse", async () => {
    const db = new PGlite();
    try {
      await migrate(db);
      const sid = await seedSource(db, "Parser", "parser.example");
      await db.query(
        `INSERT INTO source_endpoints (source_id, endpoint_type, url, last_checked, last_success_at)
         VALUES ($1, 'rss', 'https://parser.example/feed', $2, $2)`,
        [sid, hoursAgo(1)]
      );
      // History at 0.94, then a current window at ~0.21.
      for (let i = 0; i < 5; i++) {
        await db.query(
          `INSERT INTO source_health (source_id, checked_at, fetch_success_rate, articles_discovered, health_state, diagnostics)
           VALUES ($1, $2, 0.94, 50, 'HEALTHY', '{}')`,
          [sid, hoursAgo((i + 2) * 24)]
        );
      }
      for (let i = 0; i < 15; i++) {
        const url = `https://parser.example/ok/${i}`;
        await db.query(
          `INSERT INTO crawl_queue (url, canonical_url, source_id, status, last_attempt_at, discovered_at)
           VALUES ($1, $1, $2, 'fetched', $3, $3)`,
          [url, sid, hoursAgo(2)]
        );
      }
      for (let i = 0; i < 4; i++) {
        const url = `https://parser.example/low/${i}`;
        await db.query(
          `INSERT INTO crawl_queue (url, canonical_url, source_id, status, last_attempt_at, discovered_at)
           VALUES ($1, $1, $2, 'extracted', $3, $3)`,
          [url, sid, hoursAgo(2)]
        );
      }
      const { alerts } = await checkSourceHealth(query(db), sid, { windowHours: 24 });
      expect(alerts.map((a) => a.code)).toContain("PARSER_DRIFT_SUSPECTED");
    } finally {
      await db.close();
    }
  }, 180000);
});
