import { discoverSource, type Fetcher } from "../crawler/discovery/discover";
import type { DiscoveryEndpoint } from "../crawler/discovery/types";
import { buildEnqueueQuery } from "../crawler/queues/enqueue";
import type { PipelineDatabase } from "./database";

/** Queue insert and checkpoint advancement commit together, per source. */
export async function runDiscovery(db: PipelineDatabase, maxSources = 100, fetcher?: Fetcher) {
  const runId = (await db.query("INSERT INTO public.crawl_runs DEFAULT VALUES RETURNING id"))
    .rows[0].id;
  let attempted = 0,
    succeeded = 0,
    inserted = 0,
    errors = 0;
  try {
    const sources = (
      await db.query(
        `SELECT s.id, s.domain, s.priority FROM public.sources s
      WHERE s.active AND EXISTS (SELECT 1 FROM public.source_endpoints e WHERE e.source_id=s.id AND e.active)
      ORDER BY (SELECT min(COALESCE(e.last_checked, 'epoch'::timestamptz))
                FROM public.source_endpoints e WHERE e.source_id=s.id AND e.active), s.id LIMIT $1`,
        [maxSources]
      )
    ).rows;
    for (const row of sources) {
      attempted++;
      try {
        const result = await db.transaction(async (tx) => {
          // Lock source before reading cursors; overlapping runs cannot regress them.
          const active = await tx.query(
            "SELECT id FROM public.sources WHERE id=$1 AND active FOR UPDATE",
            [row.id]
          );
          if (!active.rows.length) return { count: 0, ok: false, errors: 0 };
          const endpoints = (
            await tx.query(
              `SELECT * FROM public.source_endpoints
            WHERE source_id=$1 AND active ORDER BY id`,
              [row.id]
            )
          ).rows.map((e) => ({
            ...e,
            last_seen_published_at:
              e.last_seen_published_at instanceof Date
                ? e.last_seen_published_at.toISOString()
                : e.last_seen_published_at,
          })) as unknown as DiscoveryEndpoint[];
          const poll = await discoverSource(
            { id: Number(row.id), domain: String(row.domain), priority: String(row.priority) },
            endpoints,
            { fetcher }
          );
          let count = 0;
          if (poll.queueRows.length) {
            const query = buildEnqueueQuery(poll.queueRows);
            count = (await tx.query(query.text + " RETURNING id", query.values)).rows.length;
          }
          for (const endpoint of poll.endpointResults) {
            const cp = poll.checkpoints[endpoint.url];
            if (cp)
              await tx.query(
                `UPDATE public.source_endpoints SET last_checked=now(),
              last_seen_url=$2, last_seen_published_at=$3, last_success_at=$4 WHERE url=$1`,
                [endpoint.url, cp.last_seen_url, cp.last_seen_published_at, cp.last_success_at]
              );
            else
              await tx.query("UPDATE public.source_endpoints SET last_checked=now() WHERE url=$1", [
                endpoint.url,
              ]);
          }
          return {
            count,
            ok: poll.endpointResults.some((e) => e.ok),
            errors: poll.endpointResults.filter((e) => !e.ok).length,
          };
        });
        inserted += result.count;
        succeeded += Number(result.ok);
        errors += result.errors;
      } catch {
        errors++;
      }
    }
    await db.query(
      `UPDATE public.crawl_runs SET completed_at=now(), status=$2,
      sources_attempted=$3, sources_succeeded=$4, urls_discovered=$5, errors=$6 WHERE id=$1`,
      [runId, errors ? "failed" : "complete", attempted, succeeded, inserted, errors]
    );
    return { runId, attempted, succeeded, inserted, errors };
  } catch (error) {
    await db.query(
      "UPDATE public.crawl_runs SET status='failed', completed_at=now(), errors=$2 WHERE id=$1",
      [runId, errors + 1]
    );
    throw error;
  }
}
