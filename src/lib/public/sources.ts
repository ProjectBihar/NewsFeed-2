// Public source registry (Phase 32): stable /source/[slug] pages for every
// active source in data/sources/registry.json — the same reviewed file that
// seeds the `sources` table (scripts/generate-source-seed.mjs), so demo and
// live slugs always agree. Only reader-facing fields cross this boundary
// (name, homepage domain, language, scope, source type): crawler diagnostics
// (endpoints, verification, priority, wave, notes, requires_browser, group)
// stay admin-side — the plan says "Do not expose internal crawler diagnostics
// publicly".
import registryData from "../../../data/sources/registry.json";

export interface PublicSource {
  /** Stable route slug: slugify(name), e.g. "The Hindu" → "the-hindu". */
  slug: string;
  name: string;
  /** Publisher homepage domain — already published on story report rows. */
  domain: string;
  language: string;
  scope: string;
  sourceType: string;
}

interface RegistrySource {
  name: string;
  domain: string;
  language: string;
  scope: string;
  source_type: string;
  active: boolean;
}

const REGISTRY = (registryData as { sources: RegistrySource[] }).sources;

/** Lowercase ASCII slug — deterministic, so a source's URL never changes. */
export function slugifySourceName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Every ACTIVE registry source, alphabetical — the /source index order.
 *  Inactive registry entries (News18 Bihar, Press Information Bureau) are
 *  not published: the plan's gate is "each active source has a stable
 *  public page", and a source we no longer crawl has no coverage to show. */
export const SOURCES: PublicSource[] = REGISTRY.filter((s) => s.active)
  .map((s) => ({
    slug: slugifySourceName(s.name),
    name: s.name,
    domain: s.domain,
    language: s.language,
    scope: s.scope,
    sourceType: s.source_type,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const BY_SLUG = new Map(SOURCES.map((s) => [s.slug, s]));
const SLUG_BY_NAME = new Map(SOURCES.map((s) => [s.name, s.slug]));

/** Route slug → active source; null for unknown or inactive slugs (404). */
export function getSourceBySlug(slug: string): PublicSource | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Display name → route slug (for coverage rows on district pages); null
 *  when the name is not an active registry source (e.g. fixture-only
 *  "Business Standard" — never a guessed URL or a dead link). */
export function slugForSourceName(name: string): string | null {
  return SLUG_BY_NAME.get(name) ?? null;
}
