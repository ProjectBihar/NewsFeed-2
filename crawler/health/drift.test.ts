import { describe, expect, it } from "vitest";
import { checkDiscoveryVolume, checkExtractionDrift, median } from "./drift";

describe("median (Phase 20)", () => {
  it("handles empty, odd, and even windows", () => {
    expect(median([])).toBeNull();
    expect(median([40, 80, 60])).toBe(60);
    expect(median([40, 80])).toBe(60);
  });
});

describe("checkDiscoveryVolume (Phase 20)", () => {
  it("fires critical on a zero drop from a healthy baseline", () => {
    const alert = checkDiscoveryVolume([40, 80, 60, 55, 70], 0);
    expect(alert).toMatchObject({ code: "DISCOVERY_VOLUME_ANOMALY", severity: "critical" });
  });

  it("fires warning on collapse below 20% of a solid baseline", () => {
    const alert = checkDiscoveryVolume([50, 60, 55], 5);
    expect(alert).toMatchObject({ code: "DISCOVERY_VOLUME_ANOMALY", severity: "warning" });
  });

  it("stays silent on normal fluctuation and thin baselines", () => {
    expect(checkDiscoveryVolume([40, 80, 60], 45)).toBeNull();
    expect(checkDiscoveryVolume([40, 80, 60], 60)).toBeNull();
    expect(checkDiscoveryVolume([0, 1, 0], 0)).toBeNull();
    expect(checkDiscoveryVolume([], 0)).toBeNull();
  });

  it("ignores a single outlier day via the median", () => {
    expect(checkDiscoveryVolume([50, 55, 52, 500, 48], 45)).toBeNull();
  });
});

describe("checkExtractionDrift (Phase 20)", () => {
  it("suspects parser drift on 0.94 -> 0.21", () => {
    const alert = checkExtractionDrift([0.94, 0.93, 0.95, 0.94], 0.21, 19);
    expect(alert).toMatchObject({ code: "PARSER_DRIFT_SUSPECTED" });
  });

  it("stays silent without enough samples, history, or drop", () => {
    expect(checkExtractionDrift([0.94, 0.93], 0.21, 3)).toBeNull();
    expect(checkExtractionDrift([], 0.21, 19)).toBeNull();
    expect(checkExtractionDrift([0.94, 0.93], null, 19)).toBeNull();
    expect(checkExtractionDrift([0.94, 0.93], 0.9, 19)).toBeNull();
    expect(checkExtractionDrift([0.6, 0.62], 0.4, 19)).toBeNull();
  });
});
