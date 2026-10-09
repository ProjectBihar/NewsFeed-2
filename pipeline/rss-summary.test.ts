import { describe, it, expect } from "vitest";
import { summaryHtml } from "./rss-summary";
describe("publisher RSS summaries", () => {
  it("uses only published summary fields and rejects a foreign article destination", () => {
    const entry = {
      url: "https://ndtv.in/bihar-news/test-123456",
      title: "Bihar school & health update",
      summary:
        "<p>Bihar announces new school buildings and public health infrastructure for residents in Patna.</p>",
      publishedAt: new Date("2026-10-09T00:00:00Z"),
      via: "rss" as const,
    };
    const html = summaryHtml(entry, "ndtv.in");
    expect(html).toContain("Bihar school &amp; health update");
    expect(html).toContain("2026-10-09T00:00:00.000Z");
    expect(summaryHtml({ ...entry, url: "https://foreign.example/story" }, "ndtv.in")).toBeNull();
    expect(summaryHtml({ ...entry, summary: "short" }, "ndtv.in")).toBeNull();
  });
});
