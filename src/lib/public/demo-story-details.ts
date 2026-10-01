// Demo story details (Phase 30/31): entity display names and publisher
// lookup for fixture stories, derived from the reviewed Phase 16 clustering
// benchmark (intelligence/clustering/tests/fixtures/story-clusters.json).
// The article facts themselves live in demo-articles.ts (single source of
// truth for story reports and district archives) — this module keeps the
// hand-curated display layer:
//
// - Report links go to the ORIGINAL PUBLISHER: the registry homepage for
//   registered sources. Sources outside the registry (fixture-only, e.g.
//   business-standard) keep their name with `homepage: null` — no fabricated
//   URLs. Article bodies are never carried here (copyright rule).
// - Entity display names must round-trip to fixture entity slugs.
import registryData from "../../../data/sources/registry.json";

const REGISTRY = registryData as unknown as {
  sources: Array<{ name: string; domain: string }>;
};

// Fixture slug → registry source name (verified against registry.json in
// story.test.ts). Slugs not listed here fall back to a prettified name with
// no link.
const REGISTRY_NAME_BY_SLUG: Record<string, string> = {
  "the-hindu": "The Hindu",
  "indian-express": "Indian Express",
  jagran: "Dainik Jagran",
  "prabhat-khabar": "Prabhat Khabar",
  bhaskar: "Dainik Bhaskar Bihar",
  toi: "Times of India Patna",
  et: "Economic Times",
};

/** Publisher name + homepage for a fixture source slug; homepage is null
 *  rather than guessed when the registry does not know the source. */
export function demoPublisher(slug: string): { name: string; homepage: string | null } {
  const registryName = REGISTRY_NAME_BY_SLUG[slug];
  const entry = REGISTRY.sources.find((s) => s.name === registryName);
  if (entry) return { name: entry.name, homepage: `https://${entry.domain}` };
  return { name: prettifySlug(slug), homepage: null };
}

function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Entity display names per story: the fixture member entities' display
 *  forms, ordered by mention count (desc), name (asc) on ties — the order is
 *  asserted against fixture counts in story.test.ts. Stories with no fixture
 *  entities are absent (the page then hides the section honestly). */
export const DEMO_ENTITIES: Record<string, string[]> = {
  // Mention count desc; name asc on ties (the order is asserted against
  // fixture counts in story.test.ts).
  "metro-approval": ["Bihar Cabinet", "Patna Metro", "Bihta", "Patna"],
  "flood-relief": ["Kosi", "Saharsa", "Supaul", "Bihar Government"],
  "bpsc-calendar": ["BPSC"],
  "bridge-collapse": ["Road Construction Dept", "Saran"],
  "s-fares": ["Patna", "Patna Metro"],
  "s-robbery": ["Bihar Police"],
  "s-cag": ["Finance Dept"],
  "s-protest": ["Education Dept"],
  "s-gdp": ["Finance Dept"],
  "s-tender": ["Bihta", "Patna Metro"],
  // s-rally and s-cricket: fixture entities are empty — no section rendered.
};
