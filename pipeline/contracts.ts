export interface KnowledgeEntity {
  id: string;
  canonical_name: string;
  type: string;
  district: string | null;
  aliases: string[];
  hindi_names: string[];
  romanisations: string[];
  latitude?: number | null;
  longitude?: number | null;
}
export interface Analysis {
  article: {
    title: string | null;
    body: string | null;
    description: string | null;
    canonical_url: string | null;
    published_at: string | null;
    extraction_confidence: string;
    warnings: string[];
  };
  language: { language: string; language_confidence: number; script_mix: string };
  relevance: { pass: boolean; score: number; evidence: string[] };
  classification: {
    article_type: string;
    curated: boolean;
    significance_tier: string;
    reason_codes: string[];
  };
  topic: { primary_category: string | null; reason_codes: string[] };
  event: { event_type: string | null; reason_codes: string[] };
  entities: KnowledgeEntity[];
  districts: string[];
  keys: { canonical_url: string; content_hash: string | null; headline_hash: string | null };
  fingerprint: string;
  classifier_version: string;
}
export interface Assignment {
  duplicate_of?: number | string;
  story_id?: number | string | null;
  cluster_score?: number;
  reason?: string;
  evidence?: unknown;
}
