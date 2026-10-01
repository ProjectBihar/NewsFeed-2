import { describe, expect, it } from "vitest";
import { countByState, isLowClassification, latestHealthPerSource, timeAgo } from "./summarize";

describe("latestHealthPerSource (Phase 21)", () => {
  it("keeps the newest row per source", () => {
    const rows = [
      { source_id: 1, health_state: "HEALTHY", checked_at: "2026-09-29T10:00:00Z" },
      { source_id: 1, health_state: "BROKEN", checked_at: "2026-09-29T11:00:00Z" },
      { source_id: 2, health_state: "STALE", checked_at: "2026-09-29T09:00:00Z" },
    ] as never;
    const latest = latestHealthPerSource(rows);
    expect(latest.get(1)?.health_state).toBe("BROKEN");
    expect(latest.get(2)?.health_state).toBe("STALE");
  });
});

describe("countByState (Phase 21)", () => {
  it("counts known states and unknowns", () => {
    const latest = new Map([
      [1, { source_id: 1, health_state: "HEALTHY", checked_at: "x" }],
      [2, { source_id: 2, health_state: "BLOCKED", checked_at: "x" }],
    ]) as never;
    expect(countByState(latest, [1, 2, 3])).toEqual({
      HEALTHY: 1,
      DEGRADED: 0,
      BROKEN: 0,
      STALE: 0,
      BLOCKED: 1,
      UNKNOWN: 1,
    });
  });
});

describe("timeAgo (Phase 21)", () => {
  const NOW = Date.parse("2026-09-29T12:00:00Z");
  it("renders relative times and never", () => {
    expect(timeAgo(null, NOW)).toBe("never");
    expect(timeAgo("2026-09-29T11:59:30Z", NOW)).toBe("just now");
    expect(timeAgo("2026-09-29T11:20:00Z", NOW)).toBe("40m ago");
    expect(timeAgo("2026-09-29T09:00:00Z", NOW)).toBe("3h ago");
    expect(timeAgo("2026-09-24T12:00:00Z", NOW)).toBe("5d ago");
  });
});

describe("isLowClassification (Phase 21)", () => {
  it("applies the 0.6 review cutoff", () => {
    expect(isLowClassification(0.59)).toBe(true);
    expect(isLowClassification(0.6)).toBe(false);
    expect(isLowClassification(null)).toBe(false);
  });
});
