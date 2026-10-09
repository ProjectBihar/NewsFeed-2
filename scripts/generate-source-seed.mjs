// Renders data/sources/registry.json into versioned seed migrations.
// Usage: npm run registry:generate
// Never hand-edit the generated SQL; edit registry.json and regenerate.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY = join(root, "data", "sources", "registry.json");
export const MIGRATION = join(root, "supabase", "migrations", "20260928000002_phase3_sources.sql");
export const BROWSER_FLAGS_MIGRATION = join(
  root,
  "supabase",
  "migrations",
  "20260928000003_phase6_browser_flags.sql"
);

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const bool = (b) => (b ? "TRUE" : "FALSE");
export const EXPANSION_MIGRATION = join(
  root,
  "supabase",
  "migrations",
  "20261010000001_bihar_source_expansion.sql"
);
const foundation = (registry) => ({
  ...registry,
  version: 1,
  verified_at: "2026-09-28",
  sources: registry.sources.filter((s) => s.wave === "A"),
});

export function renderSeed(registry) {
  registry = foundation(registry);
  const lines = [
    "-- ProjectBihar Newsfeed V2 — Phase 3: Source registry seed.",
    "--",
    "-- GENERATED FILE. Do not hand-edit.",
    "-- Source: data/sources/registry.json",
    "-- Regenerate: npm run registry:generate",
    `-- Registry version: ${registry.version}, verified: ${registry.verified_at}`,
    `-- Sources: ${registry.sources.length}, endpoints: ${registry.sources.reduce((n, s) => n + s.endpoints.length, 0)}`,
    "",
  ];
  for (const s of registry.sources) {
    lines.push(
      `INSERT INTO public.sources (name, domain, language, scope, source_type, priority, active)`,
      `VALUES (${q(s.name)}, ${q(s.domain)}, ${q(s.language)}, ${q(s.scope)}, ${q(s.source_type)}, ${q(s.priority)}, ${bool(s.active)})`,
      `ON CONFLICT (domain) DO NOTHING;`
    );
    for (const e of s.endpoints) {
      lines.push(
        `INSERT INTO public.source_endpoints (source_id, endpoint_type, url, active, priority)`,
        `SELECT id, ${q(e.endpoint_type)}, ${q(e.url)}, ${bool(e.active)}, ${q(e.priority)} FROM public.sources WHERE domain = ${q(s.domain)}`,
        `ON CONFLICT (url) DO NOTHING;`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderBrowserFlags(registry) {
  registry = foundation(registry);
  const flagged = registry.sources.filter((s) => s.requires_browser === true);
  const lines = [
    "-- ProjectBihar Newsfeed V2 — Phase 6: browser-fallback routing flags.",
    "--",
    "-- GENERATED FILE. Do not hand-edit.",
    "-- Source: data/sources/registry.json (requires_browser fields)",
    "-- Regenerate: npm run registry:generate",
    `-- Registry version: ${registry.version}, flagged sources: ${flagged.length}`,
    "",
    "ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS requires_browser BOOLEAN NOT NULL DEFAULT FALSE;",
    "",
    "COMMENT ON COLUMN public.sources.requires_browser IS 'Operator-set: use Playwright fallback for this source. Never auto-escalated; evidence required (Phase 6).';",
    "",
  ];
  if (flagged.length === 0) {
    lines.push("-- No flagged sources: every registry source stays HTTP-only.");
  }
  for (const s of flagged) {
    lines.push(`UPDATE public.sources SET requires_browser = TRUE WHERE domain = ${q(s.domain)};`);
  }
  return lines.join("\n") + "\n";
}

export function renderExpansion(registry) {
  const lines = [
    "-- GENERATED additive expansion. Existing IDs, endpoints and checkpoints are preserved.",
    "-- Source: data/sources/registry.json; npm run registry:generate",
    "ALTER TABLE public.source_endpoints ADD COLUMN IF NOT EXISTS include_pattern TEXT;",
    "ALTER TABLE public.source_endpoints ADD COLUMN IF NOT EXISTS allow_pdf BOOLEAN NOT NULL DEFAULT FALSE;",
    "ALTER TABLE public.crawl_queue ADD COLUMN IF NOT EXISTS discovery_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;",
    "ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS feed_only BOOLEAN NOT NULL DEFAULT FALSE;",
    "",
  ];
  for (const s of registry.sources.filter((s) => s.wave !== "A")) {
    lines.push(
      `INSERT INTO public.sources (name,domain,language,scope,source_type,priority,active,requires_browser,feed_only) VALUES (${q(s.name)},${q(s.domain)},${q(s.language)},${q(s.scope)},${q(s.source_type)},${q(s.priority)},${bool(s.active)},FALSE,${bool(s.feed_only ?? false)}) ON CONFLICT (domain) DO NOTHING;`
    );
    for (const e of s.endpoints)
      lines.push(
        `INSERT INTO public.source_endpoints (source_id,endpoint_type,url,active,priority,include_pattern,allow_pdf) SELECT id,${q(e.endpoint_type)},${q(e.url)},${bool(e.active)},${q(e.priority)},${e.include_pattern ? q(e.include_pattern) : "NULL"},${bool(e.allow_pdf ?? false)} FROM public.sources WHERE domain=${q(s.domain)} ON CONFLICT (url) DO NOTHING;`
      );
  }
  return lines.join("\n") + "\n";
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));
  writeFileSync(MIGRATION, renderSeed(registry));
  writeFileSync(BROWSER_FLAGS_MIGRATION, renderBrowserFlags(registry));
  writeFileSync(EXPANSION_MIGRATION, renderExpansion(registry));
  console.log(
    `Wrote ${MIGRATION}: ${registry.sources.length} sources, ` +
      `${registry.sources.reduce((n, s) => n + s.endpoints.length, 0)} endpoints.`
  );
  console.log(
    `Wrote ${BROWSER_FLAGS_MIGRATION}: ${registry.sources.filter((s) => s.requires_browser === true).length} flagged.`
  );
}
