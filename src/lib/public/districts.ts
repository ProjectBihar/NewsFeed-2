// Bihar district geography (Phase 31): the canonical 38-district list from
// the reviewed geography dataset. District routes resolve through this file,
// so every slug in use maps to real geography — an unknown slug 404s rather
// than inventing a district.
import districtsData from "../../../data/geography/districts.json";

export interface District {
  id: string;
  name: string;
}

const ENTITIES = (districtsData as { entities: Array<{ id: string; canonical_name: string }> })
  .entities;

/** All 38 districts, alphabetical by name — the /district index order. */
export const DISTRICTS: District[] = ENTITIES.map((e) => ({
  id: e.id,
  name: e.canonical_name,
})).sort((a, b) => a.name.localeCompare(b.name));

const BY_SLUG = new Map(DISTRICTS.map((d) => [d.id, d]));
const SLUG_BY_NAME = new Map(DISTRICTS.map((d) => [d.name, d.id]));

/** Route slug → district; null when the slug is not real Bihar geography. */
export function getDistrictBySlug(slug: string): District | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Canonical display name → route slug (for links from story facts). */
export function slugForDistrictName(name: string): string | null {
  return SLUG_BY_NAME.get(name) ?? null;
}
