// Read-only host verification. No database, credentials or publisher bypasses.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { discoverSource, defaultFetcher } = require("../.pipeline/crawler/discovery/discover.js");
const registry = JSON.parse(readFileSync("data/sources/registry.json", "utf8"));
const sources = registry.sources.filter((s) => s.wave !== "A" && s.active);
const reports = [];
for (let i = 0; i < sources.length; i += 3) {
  const group = await Promise.all(
    sources.slice(i, i + 3).map(async (s) => {
      const poll = await discoverSource(
        { id: 1, domain: s.domain, priority: s.priority },
        s.endpoints
          .filter((e) => e.active)
          .map((e) => ({ ...e, last_seen_url: null, last_seen_published_at: null })),
        { maxUrls: 20 }
      );
      const report = {
        name: s.name,
        domain: s.domain,
        type: s.source_type,
        endpoints: poll.endpointResults,
        discovered: poll.queueRows.length,
      };
      if (s.feed_only) {
        report.feedSummary = true;
        report.sample = {
          usable: poll.entries.every((e) => !!e.title && !!e.summary),
          sampledFromFeed: true,
        };
      } else if (s.source_type === "news" && poll.queueRows.length) {
        try {
          const r = await defaultFetcher(poll.queueRows[0].url);
          report.sample = {
            url: poll.queueRows[0].url,
            status: r.status,
            html: /html/i.test(r.contentType),
            usable: r.status === 200 && r.text.length > 500,
          };
        } catch {
          report.sample = { usable: false };
        }
      }
      return report;
    })
  );
  reports.push(...group);
  group.forEach((r) => console.log(JSON.stringify(r)));
}
writeFileSync(
  process.env.SOURCE_VERIFICATION_OUTPUT || ".test-tmp/source-verification.json",
  JSON.stringify({ checkedAt: new Date().toISOString(), reports }, null, 2)
);
if (
  reports.some(
    (r) =>
      r.endpoints.some((e) => !e.ok) ||
      (r.type === "news" && ((!r.discovered && !r.feedSummary) || !r.sample?.usable))
  )
)
  process.exitCode = 1;
