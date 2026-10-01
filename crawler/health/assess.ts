// Health assessment rules (Phase 19). Order matters: BLOCKED and
// BROKEN describe failing acquisition; STALE describes quiet-but-working
// acquisition (the "no news" vs "crawler failed" distinction); DEGRADED
// is partial failure; HEALTHY is the residue.

import {
  DEFAULT_THRESHOLDS,
  type HealthAssessment,
  type HealthThresholds,
  type SourceHealthInput,
} from "./types";

export function assessSourceHealth(
  input: SourceHealthInput,
  thresholds: HealthThresholds = DEFAULT_THRESHOLDS
): HealthAssessment {
  const reasons: string[] = [];
  const { polls, fetch, extraction } = input;
  const hoursSince = (iso: string | null): number | null => {
    if (!iso) return null;
    return (Date.parse(input.now) - Date.parse(iso)) / 3600000;
  };

  // BLOCKED: recent attempts dominated by 403s (bot protection, not breakage).
  if (
    fetch.attempted >= thresholds.minFetchAttempts &&
    fetch.blocked403 / fetch.attempted >= thresholds.blockedShare
  ) {
    reasons.push(`blocked: ${fetch.blocked403}/${fetch.attempted} recent attempts are 403`);
    return { sourceId: input.sourceId, state: "BLOCKED", checkedAt: input.now, reasons };
  }

  // BROKEN: polls attempted but failing, or fetches almost all failing.
  const pollRate = polls.attempted > 0 ? polls.succeeded / polls.attempted : null;
  if (polls.attempted >= 3 && (pollRate ?? 1) < 0.5) {
    reasons.push(
      `broken: endpoint polls failing (${polls.succeeded}/${polls.attempted} succeeded)`
    );
    return { sourceId: input.sourceId, state: "BROKEN", checkedAt: input.now, reasons };
  }
  const fetchRate = fetch.attempted > 0 ? fetch.succeeded / fetch.attempted : null;
  if (fetch.attempted >= thresholds.minFetchAttempts && (fetchRate ?? 1) < thresholds.brokenBelow) {
    reasons.push(
      `broken: fetch success ${fetch.succeeded}/${fetch.attempted} below ${thresholds.brokenBelow}`
    );
    return { sourceId: input.sourceId, state: "BROKEN", checkedAt: input.now, reasons };
  }

  // STALE: nothing discovered recently, even when polls succeed (quiet
  // feeds read STALE; failing polls already returned BROKEN above).
  const discoveryAge = hoursSince(input.lastDiscoveryAt);
  if (discoveryAge == null) {
    reasons.push("stale: never discovered anything");
    return { sourceId: input.sourceId, state: "STALE", checkedAt: input.now, reasons };
  }
  if (discoveryAge > thresholds.staleAfterHours) {
    reasons.push(
      `stale: last discovery ${Math.round(discoveryAge)}h ago exceeds ${thresholds.staleAfterHours}h`
    );
    return { sourceId: input.sourceId, state: "STALE", checkedAt: input.now, reasons };
  }

  // DEGRADED: partial failure bands.
  if (
    fetch.attempted >= thresholds.minFetchAttempts &&
    (fetchRate ?? 1) < thresholds.degradedBelow
  ) {
    reasons.push(
      `degraded: fetch success ${fetch.succeeded}/${fetch.attempted} below ${thresholds.degradedBelow}`
    );
    return { sourceId: input.sourceId, state: "DEGRADED", checkedAt: input.now, reasons };
  }
  if (
    fetch.attempted >= thresholds.minFetchAttempts &&
    fetch.rateLimited429 / fetch.attempted >= thresholds.rateLimitShare
  ) {
    reasons.push(`degraded: 429 rate-limit pressure (${fetch.rateLimited429}/${fetch.attempted})`);
    return { sourceId: input.sourceId, state: "DEGRADED", checkedAt: input.now, reasons };
  }
  if (
    extraction &&
    extraction.attempted >= thresholds.minExtractionAttempts &&
    extraction.succeeded / extraction.attempted < thresholds.extractionBelow
  ) {
    reasons.push(
      `degraded: extraction success ${extraction.succeeded}/${extraction.attempted} below ${thresholds.extractionBelow}`
    );
    return { sourceId: input.sourceId, state: "DEGRADED", checkedAt: input.now, reasons };
  }

  reasons.push("healthy: acquisition nominal");
  return { sourceId: input.sourceId, state: "HEALTHY", checkedAt: input.now, reasons };
}
