// Public story metadata. Classification fields remain internal compatibility data.
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
  /** False when discovery time substitutes for an unavailable publication date. */
  dateVerified?: boolean;
}
