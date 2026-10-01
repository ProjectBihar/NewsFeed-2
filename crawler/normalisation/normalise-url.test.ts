import { describe, expect, it } from "vitest";
import { normaliseUrl } from "./normalise-url";

describe("normaliseUrl fixtures (Phase 4)", () => {
  it("leaves normal URLs alone", () => {
    expect(normaliseUrl("https://news.example.com/bihar/story-1")).toBe(
      "https://news.example.com/bihar/story-1"
    );
  });

  it("strips tracking params but keeps real ones, sorted", () => {
    expect(
      normaliseUrl(
        "https://news.example.com/bihar/s?utm_source=rss&utm_medium=feed&fbclid=abc&gclid=xyz&page=2&utm_campaign=x"
      )
    ).toBe("https://news.example.com/bihar/s?page=2");
    expect(normaliseUrl("https://news.example.com/s?z=1&a=2")).toBe(
      "https://news.example.com/s?a=2&z=1"
    );
  });

  it("resolves relative URLs against the endpoint base", () => {
    expect(normaliseUrl("/bihar/rel-1", "https://news.example.com/bihar/")).toBe(
      "https://news.example.com/bihar/rel-1"
    );
  });

  it("collapses AMP variants", () => {
    expect(normaliseUrl("https://news.example.com/bihar/s-1/amp/")).toBe(
      "https://news.example.com/bihar/s-1"
    );
    expect(normaliseUrl("https://news.example.com/bihar/s-2?amp=1")).toBe(
      "https://news.example.com/bihar/s-2"
    );
    expect(normaliseUrl("https://news.example.com/bihar/s-3?output=1")).toBe(
      "https://news.example.com/bihar/s-3"
    );
  });

  it("handles mobile-style URLs without inventing host mappings", () => {
    // ?output=1 mobile switches collapse …
    expect(normaliseUrl("https://news.example.com/bihar/m-1?output=1")).toBe(
      "https://news.example.com/bihar/m-1"
    );
    // … but m.* subdomains are preserved: folding hosts would be
    // destructive for unfamiliar publishers.
    expect(normaliseUrl("https://m.news.example.com/bihar/m-2")).toBe(
      "https://m.news.example.com/bihar/m-2"
    );
  });

  it("collapses duplicates: tracking, fragments, case, ports, slashes", () => {
    const forms = [
      "https://news.example.com/bihar/dup?utm_source=rss#top",
      "https://news.example.com/bihar/dup?fbclid=z",
      "https://news.example.com/bihar/dup/",
      "https://NEWS.example.com:443/bihar/dup",
    ].map((u) => normaliseUrl(u));
    expect(new Set(forms).size).toBe(1);
    expect(forms[0]).toBe("https://news.example.com/bihar/dup");
  });

  it("rejects invalid URLs safely", () => {
    expect(normaliseUrl("")).toBeNull();
    expect(normaliseUrl("   ")).toBeNull();
    expect(normaliseUrl("not a url")).toBeNull();
    expect(normaliseUrl("ftp://news.example.com/f")).toBeNull();
    expect(normaliseUrl("javascript:void(0)")).toBeNull();
    expect(normaliseUrl("/relative/without/base")).toBeNull();
  });
});
