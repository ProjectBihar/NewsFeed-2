// One-off: emit the Phase 16 fixture articles as UTF-8 JSON for transcription
// into src/lib/public/demo-articles.ts (console codepages mangle Hindi).
import { readFileSync, writeFileSync } from "node:fs";

const fixture = JSON.parse(
  readFileSync("intelligence/clustering/tests/fixtures/story-clusters.json", "utf8")
);
const articles = fixture.articles.map((a) => ({
  id: a.id,
  story: a.story ?? null,
  headline: a.headline,
  source: a.source,
  publishedAt: a.published_at,
  districts: a.districts,
}));
writeFileSync("temp-fixture-articles.json", JSON.stringify(articles, null, 2), "utf8");

// Cross-check every fixture district slug against districts.json.
const districts = JSON.parse(readFileSync("data/geography/districts.json", "utf8"));
const ids = new Set(districts.entities.map((e) => e.id));
const fixtureSlugs = [...new Set(articles.flatMap((a) => a.districts))];
const unknown = fixtureSlugs.filter((s) => !ids.has(s));
console.log("fixture district slugs:", fixtureSlugs.join(", "));
console.log("districts.json count:", districts.entities.length);
console.log(
  unknown.length === 0 ? "ALL FIXTURE DISTRICT SLUGS KNOWN" : `UNKNOWN: ${unknown.join(", ")}`
);
