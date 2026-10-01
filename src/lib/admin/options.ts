// Admin correction vocabularies (Phase 22). UI mirrors of the
// intelligence taxonomies; districts load from the knowledge base.
import districtsData from "../../../data/geography/districts.json";

export const ARTICLE_TYPES = [
  "development",
  "governance",
  "politics",
  "election_campaign",
  "crime",
  "accident",
  "court",
  "weather",
  "environmental_event",
  "sports",
  "entertainment",
  "opinion",
  "analysis",
  "official_release",
  "roundup",
  "advertorial",
  "miscellaneous",
] as const;

export const CATEGORIES = [
  "Economy",
  "Infrastructure",
  "Industry",
  "Agriculture",
  "Education",
  "Healthcare",
  "Environment",
  "Governance",
] as const;

export const EVENT_TYPES = [
  "announcement",
  "proposal",
  "approval",
  "funding",
  "tender",
  "construction_started",
  "construction_progress",
  "completion",
  "inauguration",
  "delay",
  "cancellation",
  "report",
  "audit",
  "court_order",
  "appointment",
  "recruitment",
  "policy_change",
  "programme_launch",
  "protest",
  "election_campaign",
  "accident",
  "crime",
] as const;

export interface DistrictOption {
  id: string;
  canonical_name: string;
  hindi_names: string[];
}

export const DISTRICTS: DistrictOption[] = (
  districtsData as {
    entities: Array<{ id: string; canonical_name: string; hindi_names: string[] }>;
  }
).entities.map((e) => ({
  id: e.id,
  canonical_name: e.canonical_name,
  hindi_names: e.hindi_names,
}));
