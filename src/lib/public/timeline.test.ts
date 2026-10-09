import { describe, expect, it } from "vitest";
import { parseTimelineParams, timelineBounds, timelineHref } from "./timeline";

describe("seven Bihar calendar days", () => {
  it("moves exactly at midnight IST, across month and year boundaries", () => {
    expect(timelineBounds(new Date("2026-10-10T18:29:59Z")).start).toBe("2026-10-03T18:30:00.000Z");
    expect(timelineBounds(new Date("2026-10-10T18:30:00Z")).start).toBe("2026-10-04T18:30:00.000Z");
    expect(timelineBounds(new Date("2027-01-01T00:00:00Z")).start).toBe("2026-12-25T18:30:00.000Z");
  });
  it("preserves today's browsing snapshot and expires yesterday or future values", () => {
    const now = new Date("2026-10-10T08:00:00Z");
    expect(parseTimelineParams({ page: "2", asof: "2026-10-10T07:00:00Z" }, now).asOf).toBe(
      "2026-10-10T07:00:00.000Z"
    );
    for (const asof of ["2026-10-09T08:00:00Z", "2026-10-10T09:00:00Z", "bad"]) {
      expect(parseTimelineParams({ asof }, now).asOf).toBe(now.toISOString());
    }
    for (const page of ["bad", "-1", "1.5", "999999999999999999999", ["1", "2"]]) {
      expect(parseTimelineParams({ page }, now).page).toBe(1);
    }
    expect(timelineHref(2, now.toISOString())).toContain("page=2&asof=");
  });
});
