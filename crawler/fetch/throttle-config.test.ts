import { describe, expect, it } from "vitest";
import { DomainThrottle } from "./domain-throttle";
import { loadFetchConfig, DEFAULT_FETCH_CONFIG } from "./config";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("DomainThrottle (Phase 5)", () => {
  it("rejects non-positive limits", () => {
    expect(() => new DomainThrottle(0)).toThrow();
  });

  it("caps concurrency per host while others proceed", async () => {
    const throttle = new DomainThrottle(2);
    let peakA = 0;
    let currentA = 0;
    const work = async () => {
      const release = await throttle.acquire("a.example");
      currentA += 1;
      peakA = Math.max(peakA, currentA);
      expect(throttle.inFlight("a.example")).toBeLessThanOrEqual(2);
      await sleep(20);
      currentA -= 1;
      release();
    };
    // A different host is never blocked by host A's saturation.
    const other = (async () => {
      const release = await throttle.acquire("b.example");
      release();
      return "b-done";
    })();
    await Promise.all([work(), work(), work(), work(), other]);
    expect(peakA).toBe(2);
    await expect(other).resolves.toBe("b-done");
    expect(throttle.inFlight("a.example")).toBe(0);
  });
});

describe("loadFetchConfig (Phase 5)", () => {
  it("uses conservative defaults", () => {
    expect(loadFetchConfig({})).toMatchObject({
      globalConcurrency: 10,
      perDomainConcurrency: 2,
    });
  });
  it("honours env overrides and ignores garbage", () => {
    expect(
      loadFetchConfig({ FETCH_MAX_CONCURRENCY: "4", FETCH_MAX_CONCURRENCY_PER_DOMAIN: "nope" })
    ).toMatchObject({ globalConcurrency: 4, perDomainConcurrency: 2 });
    expect(DEFAULT_FETCH_CONFIG.maxAttempts).toBe(5);
  });
});
