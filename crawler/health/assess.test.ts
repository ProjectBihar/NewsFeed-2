import { describe, expect, it } from "vitest";
import { assessSourceHealth } from "./assess";
import { classifyFailureKind } from "./failures";
import type { SourceHealthInput } from "./types";

const NOW = "2026-09-29T12:00:00.000Z";
const FRESH = "2026-09-29T11:45:00.000Z";

function input(overrides: Partial<SourceHealthInput> = {}): SourceHealthInput {
  return {
    sourceId: 1,
    now: NOW,
    windowHours: 24,
    polls: { attempted: 10, succeeded: 10, lastSuccessAt: FRESH },
    fetch: { attempted: 20, succeeded: 19, blocked403: 0, rateLimited429: 0 },
    extraction: null,
    lastDiscoveryAt: FRESH,
    ...overrides,
  };
}

describe("classifyFailureKind (Phase 19)", () => {
  it("maps Phase 5 reason strings", () => {
    expect(classifyFailureKind(null)).toBeNull();
    expect(classifyFailureKind("http-403-blocked")).toBe("blocked403");
    expect(classifyFailureKind("http-401-blocked")).toBe("blocked403");
    expect(classifyFailureKind("http-429-rate-limited")).toBe("rateLimited429");
    expect(classifyFailureKind("http-500-server-error")).toBe("serverError");
    expect(classifyFailureKind("http-404-gone")).toBe("permanent");
    expect(classifyFailureKind("http-408-timeout")).toBe("timeout");
    expect(classifyFailureKind("network-error: connect ETIMEDOUT")).toBe("timeout");
    expect(classifyFailureKind("attempts-exhausted: http-500-server-error")).toBe("serverError");
    expect(classifyFailureKind("attempts-exhausted: http-403-blocked")).toBe("blocked403");
    expect(classifyFailureKind("stale-claim-released")).toBe("other");
  });
});

describe("assessSourceHealth states (Phase 19)", () => {
  it("reports HEALTHY for nominal acquisition", () => {
    const result = assessSourceHealth(input());
    expect(result.state).toBe("HEALTHY");
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it("reports BLOCKED on 403 dominance, not BROKEN", () => {
    const result = assessSourceHealth(
      input({ fetch: { attempted: 10, succeeded: 1, blocked403: 8, rateLimited429: 0 } })
    );
    expect(result.state).toBe("BLOCKED");
  });

  it("reports BROKEN on failing polls", () => {
    const result = assessSourceHealth(
      input({
        polls: { attempted: 6, succeeded: 1, lastSuccessAt: "2026-09-20T00:00:00.000Z" },
        fetch: { attempted: 0, succeeded: 0, blocked403: 0, rateLimited429: 0 },
        lastDiscoveryAt: "2026-09-20T00:00:00.000Z",
      })
    );
    expect(result.state).toBe("BROKEN");
  });

  it("reports BROKEN on near-zero fetch success", () => {
    const result = assessSourceHealth(
      input({ fetch: { attempted: 10, succeeded: 1, blocked403: 1, rateLimited429: 0 } })
    );
    expect(result.state).toBe("BROKEN");
  });

  it("distinguishes quiet success (STALE) from failure", () => {
    const quiet = assessSourceHealth(
      input({
        polls: { attempted: 10, succeeded: 10, lastSuccessAt: FRESH },
        fetch: { attempted: 0, succeeded: 0, blocked403: 0, rateLimited429: 0 },
        lastDiscoveryAt: "2026-09-20T00:00:00.000Z",
      })
    );
    // Fresh polls but ancient discovery: quiet, not broken.
    expect(quiet.state).toBe("STALE");
  });

  it("reports STALE for never-polled sources", () => {
    const result = assessSourceHealth(
      input({
        polls: { attempted: 0, succeeded: 0, lastSuccessAt: null },
        fetch: { attempted: 0, succeeded: 0, blocked403: 0, rateLimited429: 0 },
        lastDiscoveryAt: null,
      })
    );
    expect(result.state).toBe("STALE");
  });

  it("reports DEGRADED on partial fetch failure", () => {
    const result = assessSourceHealth(
      input({ fetch: { attempted: 10, succeeded: 6, blocked403: 0, rateLimited429: 0 } })
    );
    expect(result.state).toBe("DEGRADED");
  });

  it("reports DEGRADED on 429 pressure", () => {
    const result = assessSourceHealth(
      input({ fetch: { attempted: 10, succeeded: 8, blocked403: 0, rateLimited429: 3 } })
    );
    expect(result.state).toBe("DEGRADED");
  });

  it("reports DEGRADED on extraction collapse once wired", () => {
    const result = assessSourceHealth(input({ extraction: { attempted: 10, succeeded: 4 } }));
    expect(result.state).toBe("DEGRADED");
  });

  it("ignores unwired extraction (null)", () => {
    expect(assessSourceHealth(input({ extraction: null })).state).toBe("HEALTHY");
  });
});
