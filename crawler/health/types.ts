// Source-health contracts (Phase 19). One state per source, always
// with reasons. Thresholds are defaults; tune per-source later.

export type HealthState = "HEALTHY" | "DEGRADED" | "BROKEN" | "STALE" | "BLOCKED";

export interface HealthThresholds {
  /** Minimum fetch attempts before rate rules apply. */
  minFetchAttempts: number;
  /** Share of 403s that means bot-blocked rather than broken. */
  blockedShare: number;
  /** Fetch success below this (with enough attempts) is BROKEN. */
  brokenBelow: number;
  /** Fetch success below this is DEGRADED. */
  degradedBelow: number;
  /** 429 share at/above this is DEGRADED (rate-limit pressure). */
  rateLimitShare: number;
  /** Minimum extraction attempts before its rule applies. */
  minExtractionAttempts: number;
  /** Extraction success below this is DEGRADED. */
  extractionBelow: number;
  /** No successful poll/data within this long is STALE. */
  staleAfterHours: number;
}

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  minFetchAttempts: 5,
  blockedShare: 0.5,
  brokenBelow: 0.2,
  degradedBelow: 0.8,
  rateLimitShare: 0.2,
  minExtractionAttempts: 5,
  extractionBelow: 0.7,
  staleAfterHours: 24,
};

export interface SourceHealthInput {
  sourceId: number;
  now: string;
  windowHours: number;
  /** Discovery-channel polls in the window. */
  polls: {
    attempted: number;
    succeeded: number;
    lastSuccessAt: string | null;
  };
  /** Article fetches in the window. */
  fetch: {
    attempted: number;
    succeeded: number;
    blocked403: number;
    rateLimited429: number;
  };
  /** Extraction outcomes in the window (nulls when unwired). */
  extraction: {
    attempted: number;
    succeeded: number;
  } | null;
  /** Most recent discovery of any URL (null when never). */
  lastDiscoveryAt: string | null;
}

export interface HealthAssessment {
  sourceId: number;
  state: HealthState;
  checkedAt: string;
  reasons: string[];
}
