import { connectDatabase } from "./database";
import { runDiscovery } from "./discover";
import { runProcessing } from "./process";
import { checkSourceHealth } from "../crawler/health/drift";

export function parseBound(value: string | undefined, fallback: number, max: number) {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)
    throw new Error(`Bound must be an integer between 1 and ${max}.`);
  return Number(value);
}

async function main() {
  const [stage, bound] = process.argv.slice(2);
  if (!["discover", "process", "browser", "health"].includes(stage))
    throw new Error("Usage: pipeline <discover|process|browser|health> [bound]");
  const limit = parseBound(bound, 100, stage === "discover" || stage === "health" ? 200 : 500);
  const { db, close } = connectDatabase(process.env.DATABASE_URL || "");
  try {
    let report: unknown;
    if (stage === "discover") report = await runDiscovery(db, limit);
    else if (stage === "process" || stage === "browser")
      report = await runProcessing(db, limit, stage === "browser");
    else {
      const rows = (
        await db.query(
          `SELECT s.id FROM public.sources s WHERE s.active
        AND EXISTS (SELECT 1 FROM public.source_endpoints e WHERE e.source_id=s.id AND e.active) ORDER BY
        (SELECT max(h.checked_at) FROM public.source_health h WHERE h.source_id=s.id) ASC NULLS FIRST,s.id LIMIT $1`,
          [limit]
        )
      ).rows;
      for (const row of rows) {
        await checkSourceHealth(db, Number(row.id), { windowHours: 24 });
      }
      report = { checked: rows.length };
    }
    console.log(JSON.stringify(report));
    if (report && typeof report === "object" && "errors" in report && Number(report.errors) > 0)
      process.exitCode = 1;
  } finally {
    await close();
  }
}

if (require.main === module)
  main().catch(() => {
    // Connection errors can contain credential-bearing URLs; never print them.
    console.error("Pipeline failed. Check configuration, migrations and crawl_runs diagnostics.");
    process.exitCode = 1;
  });
