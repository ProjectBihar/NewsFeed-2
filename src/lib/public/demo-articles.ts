// Fixture article corpus (Phase 31): all 21 reviewed Phase 16 benchmark
// articles with their per-article geography. One source of truth for both
// story-page reports (grouped by story — `demoArticlesForStory`) and
// district archives (grouped by district). The runtime may not import
// `intelligence/`, so the facts are transcribed here and cross-checked field
// by field against intelligence/clustering/tests/fixtures/story-clusters.json
// in story.test.ts (story grouping) and district.test.ts (full corpus).
export interface DemoArticle {
  id: string;
  /** Fixture story group; null for singletons (whose id doubles as the demo story id). */
  story: string | null;
  headline: string;
  /** Fixture source slug — resolve with `demoPublisher` from demo-story-details. */
  source: string;
  publishedAt: string;
  /** District slugs — the fixture's article geography (may be empty). */
  districts: string[];
}

export const DEMO_ARTICLES: DemoArticle[] = [
  {
    id: "m1a",
    story: "metro-approval",
    headline: "Cabinet approves Patna Metro expansion",
    source: "the-hindu",
    publishedAt: "2026-09-28T10:00:00+05:30",
    districts: ["patna"],
  },
  {
    id: "m1b",
    story: "metro-approval",
    headline: "Two metro corridors cleared for Bihta",
    source: "indian-express",
    publishedAt: "2026-09-28T12:30:00+05:30",
    districts: ["patna"],
  },
  {
    id: "m1c",
    story: "metro-approval",
    headline: "Patna Metro expansion gets cabinet nod",
    source: "jagran",
    publishedAt: "2026-09-28T14:00:00+05:30",
    districts: ["patna"],
  },
  {
    id: "m1d",
    story: "metro-approval",
    headline: "पटना मेट्रो विस्तार को मंजूरी",
    source: "prabhat-khabar",
    publishedAt: "2026-09-28T15:00:00+05:30",
    districts: ["patna"],
  },
  {
    id: "m1e",
    story: "metro-approval",
    headline: "मेट्रो कॉरिडोर मंजूर, बिहटा तक चलेगी मेट्रो",
    source: "bhaskar",
    publishedAt: "2026-09-28T16:30:00+05:30",
    districts: ["patna"],
  },
  {
    id: "f1a",
    story: "flood-relief",
    headline: "Relief camps house 40,000 in north Bihar",
    source: "the-hindu",
    publishedAt: "2026-09-27T18:00:00+05:30",
    districts: ["supaul", "saharsa"],
  },
  {
    id: "f1b",
    story: "flood-relief",
    headline: "Flood camps swell across Kosi belt",
    source: "jagran",
    publishedAt: "2026-09-28T08:00:00+05:30",
    districts: ["supaul", "saharsa"],
  },
  {
    id: "f1c",
    story: "flood-relief",
    headline: "बाढ़ राहत शिविरों में चालीस हजार लोग",
    source: "prabhat-khabar",
    publishedAt: "2026-09-28T09:00:00+05:30",
    districts: ["supaul", "saharsa"],
  },
  {
    id: "b1a",
    story: "bpsc-calendar",
    headline: "शिक्षक नियुक्ति परीक्षा कैलेंडर जारी",
    source: "jagran",
    publishedAt: "2026-09-27T18:00:00+05:30",
    districts: [],
  },
  {
    id: "b1b",
    story: "bpsc-calendar",
    headline: "बीपीएससी कैलेंडर: दिसंबर में परीक्षा",
    source: "prabhat-khabar",
    publishedAt: "2026-09-27T20:00:00+05:30",
    districts: [],
  },
  {
    id: "b1c",
    story: "bpsc-calendar",
    headline: "27,000 पदों पर भर्ती का ऐलान",
    source: "bhaskar",
    publishedAt: "2026-09-28T07:00:00+05:30",
    districts: [],
  },
  {
    id: "br1a",
    story: "bridge-collapse",
    headline: "Bridge collapses a year after construction",
    source: "indian-express",
    publishedAt: "2026-09-28T06:00:00+05:30",
    districts: ["saran"],
  },
  {
    id: "br1b",
    story: "bridge-collapse",
    headline: "Under-construction Gandak bridge caves in",
    source: "toi",
    publishedAt: "2026-09-28T09:00:00+05:30",
    districts: ["saran"],
  },
  {
    id: "s-fares",
    story: null,
    headline: "Metro fares announced for first corridor",
    source: "et",
    publishedAt: "2026-09-28T18:00:00+05:30",
    districts: ["patna"],
  },
  {
    id: "s-robbery",
    story: null,
    headline: "Three arrested after Patna robbery",
    source: "jagran",
    publishedAt: "2026-09-28T11:00:00+05:30",
    districts: ["patna"],
  },
  {
    id: "s-rally",
    story: null,
    headline: "Minister attacks rival at Muzaffarpur rally",
    source: "bhaskar",
    publishedAt: "2026-09-28T17:00:00+05:30",
    districts: ["muzaffarpur"],
  },
  {
    id: "s-cricket",
    story: null,
    headline: "State loses Ranji thriller",
    source: "et",
    publishedAt: "2026-09-28T19:00:00+05:30",
    districts: [],
  },
  {
    id: "s-cag",
    story: null,
    headline: "CAG flags road scheme irregularities",
    source: "the-hindu",
    publishedAt: "2026-09-26T11:00:00+05:30",
    districts: ["patna"],
  },
  {
    id: "s-protest",
    story: null,
    headline: "Teachers protest transfer policy",
    source: "prabhat-khabar",
    publishedAt: "2026-09-28T13:00:00+05:30",
    districts: [],
  },
  {
    id: "s-gdp",
    story: null,
    headline: "State GDP growth pegged at 9.2 percent",
    source: "business-standard",
    publishedAt: "2026-09-28T04:30:00+05:30",
    districts: [],
  },
  {
    id: "s-tender",
    story: null,
    headline: "Tenders invited for metro corridor works",
    source: "toi",
    publishedAt: "2026-10-28T10:00:00+05:30",
    districts: ["patna"],
  },
];

/** Articles forming a demo story: the fixture story group, or (for
 *  singletons) the article whose id doubles as the demo story id. */
export function demoArticlesForStory(storyId: string): DemoArticle[] {
  return DEMO_ARTICLES.filter((a) => a.story === storyId || a.id === storyId);
}
