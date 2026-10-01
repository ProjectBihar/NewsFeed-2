// Category pills (Phase 28) — labels and colours migrated verbatim from
// V1 (PBNews/src/lib/constants.ts) so badges keep the familiar palette.
export interface CategoryMeta {
  slug: string;
  label: string;
  color: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { slug: "economy", label: "Economy", color: "#2563eb" },
  { slug: "infrastructure", label: "Infrastructure", color: "#dc2626" },
  { slug: "industry", label: "Industry", color: "#7c3aed" },
  { slug: "agriculture", label: "Agriculture", color: "#16a34a" },
  { slug: "education", label: "Education", color: "#ea580c" },
  { slug: "healthcare", label: "Healthcare", color: "#0891b2" },
  { slug: "environment", label: "Environment", color: "#65a30d" },
  { slug: "governance", label: "Governance", color: "#8b5cf6" },
];

/** Badge colour for a category label. Unknown labels fall back to the accent
 * colour — the same value V1 used when falling back to its first category. */
export function categoryColor(category: string): string {
  const slug = category.trim().toLowerCase();
  return CATEGORIES.find((c) => c.slug === slug)?.color ?? "#2563eb";
}
