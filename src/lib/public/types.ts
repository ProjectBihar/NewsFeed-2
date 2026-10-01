// Public feed shapes (Phase 28/29). One story = one V2 `stories` row shaped
// for the reader-facing card. `curated` follows plan §54: the story enters the
// default feed when at least one member article is tier A / selected B
// (`articles.curated`); All Bihar News shows everything (A + B + C).
// `languages` are aggregated from member articles live and hand-listed in the
// reviewed demo fixture.
export interface PublicStory {
  id: number | string;
  canonicalTitle: string;
  primaryCategory: string | null;
  eventType: string | null;
  districtNames: string[];
  articleCount: number;
  sourceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  languages: string[];
  curated: boolean;
}
