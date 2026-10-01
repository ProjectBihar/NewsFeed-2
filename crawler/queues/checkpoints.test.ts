import { describe, expect, it } from "vitest";
import { applyCheckpoint, nextCheckpoint } from "./checkpoints";
import type { DiscoveryEntry } from "../discovery/types";

const d = (iso: string) => new Date(iso);
const entry = (url: string, publishedAt: Date | null = null): DiscoveryEntry => ({
  url,
  publishedAt,
  title: null,
  via: "rss",
});

describe("applyCheckpoint (Phase 4)", () => {
  const entries = [
    entry("https://x.example/n3", d("2026-09-28T10:00:00Z")),
    entry("https://x.example/n2", d("2026-09-28T09:00:00Z")),
    entry("https://x.example/n1", d("2026-09-27T08:00:00Z")),
  ];

  it("takes everything on first run (no cursor)", () => {
    const { fresh, deferred } = applyCheckpoint(entries, {
      last_seen_url: null,
      last_seen_published_at: null,
    });
    expect(fresh.map((e) => e.url)).toEqual([
      "https://x.example/n3",
      "https://x.example/n2",
      "https://x.example/n1",
    ]);
    expect(deferred).toBe(0);
  });

  it("stops at the remembered URL", () => {
    const { fresh } = applyCheckpoint(entries, {
      last_seen_url: "https://x.example/n2",
      last_seen_published_at: null,
    });
    expect(fresh.map((e) => e.url)).toEqual(["https://x.example/n3"]);
  });

  it("skips entries at or before the remembered time", () => {
    const { fresh } = applyCheckpoint(entries, {
      last_seen_url: null,
      last_seen_published_at: "2026-09-28T09:00:00Z",
    });
    expect(fresh.map((e) => e.url)).toEqual(["https://x.example/n3"]);
  });

  it("keeps walking past undated entries until the URL cursor", () => {
    const mixed = [
      entry("https://x.example/u1"),
      entry("https://x.example/u2"),
      entry("https://x.example/n1", d("2026-09-27T08:00:00Z")),
    ];
    const { fresh } = applyCheckpoint(mixed, {
      last_seen_url: "https://x.example/n1",
      last_seen_published_at: "2026-09-28T09:00:00Z",
    });
    expect(fresh.map((e) => e.url)).toEqual(["https://x.example/u1", "https://x.example/u2"]);
  });

  it("caps intake and counts the deferred remainder", () => {
    const many = Array.from({ length: 5 }, (_, i) =>
      entry(`https://x.example/m${i}`, d("2026-09-28T10:00:00Z"))
    );
    const { fresh, deferred } = applyCheckpoint(
      many,
      { last_seen_url: null, last_seen_published_at: null },
      3
    );
    expect(fresh).toHaveLength(3);
    expect(deferred).toBe(2);
  });
});

describe("nextCheckpoint (Phase 4)", () => {
  it("anchors the newest entry in the normal case", () => {
    const fresh = [
      entry("https://x.example/n3", d("2026-09-28T10:00:00Z")),
      entry("https://x.example/n2", d("2026-09-28T09:00:00Z")),
    ];
    const cp = nextCheckpoint(fresh, false, d("2026-09-28T12:00:00Z"));
    expect(cp.last_seen_url).toBe("https://x.example/n3");
    expect(cp.last_seen_published_at).toBe("2026-09-28T10:00:00.000Z");
    expect(cp.last_success_at).toBe("2026-09-28T12:00:00.000Z");
  });

  it("anchors the oldest queued entry when capped, preserving the remainder", () => {
    const fresh = [
      entry("https://x.example/n3", d("2026-09-28T10:00:00Z")),
      entry("https://x.example/n2", d("2026-09-28T09:00:00Z")),
    ];
    const cp = nextCheckpoint(fresh, true, d("2026-09-28T12:00:00Z"));
    expect(cp.last_seen_url).toBe("https://x.example/n2");
    expect(cp.last_seen_published_at).toBe("2026-09-28T09:00:00.000Z");
  });
});
