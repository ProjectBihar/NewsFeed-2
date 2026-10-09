#!/usr/bin/env node
// Scheduled retention cleanup (Phase 35 — Storage Retention).
//
// The plan: "Add a scheduled cleanup process." This is that process,
// intended to run daily (plan §50 maintenance: "temporary text cleanup").
// It calls the run_retention_cleanup RPC over PostgREST and prints the
// jsonb report {deleted, remaining, exempt, ran_at}.
//
// Honesty contract: when it CANNOT do its job — no configuration, network
// failure, HTTP error — it exits non-zero and says why, so a scheduler
// surfaces the problem instead of silently letting storage grow. It never
// touches permanent archive metadata; the function it calls can only
// delete expired temp_documents rows.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Minimal .env.local reader (KEY=VALUE lines; process.env wins). */
function readEnvFile(path) {
  try {
    const out = {};
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      if (line.trim().startsWith("#")) continue;
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      let value = match[2];
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
        (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
      ) {
        value = value.slice(1, -1);
      }
      out[match[1]] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = readEnvFile(resolve(process.cwd(), ".env.local"));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL ?? null;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  fileEnv.SUPABASE_SERVICE_ROLE_KEY ??
  null;

if (!url || !key) {
  console.error(
    "[retention] Supabase is not configured (" +
      (!url ? "NEXT_PUBLIC_SUPABASE_URL missing" : "SUPABASE_SERVICE_ROLE_KEY missing") +
      ") — no cleanup ran. Permanent archive metadata is unaffected either way."
  );
  process.exit(1);
}

const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/run_retention_cleanup`;

let response;
try {
  response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: key,
      authorization: `Bearer ${key}`,
    },
    body: "{}",
  });
} catch (error) {
  console.error(
    `[retention] could not reach ${endpoint}: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}

if (!response.ok) {
  const detail = await response.text().catch(() => "");
  console.error(`[retention] run_retention_cleanup failed: HTTP ${response.status} ${detail}`);
  process.exit(1);
}

const report = await response.json();
console.log(
  `[retention] deleted=${report.deleted} remaining=${report.remaining} ` +
    `exempt=${report.exempt} ran_at=${report.ran_at}`
);
