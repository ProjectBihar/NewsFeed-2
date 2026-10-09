import { fetchBatch, fetchBrowserBatch } from "../crawler/fetch/runner";
import { loadFetchConfig, loadBrowserConfig } from "../crawler/fetch/config";
import type { PipelineDatabase } from "./database";
import { persistAnalysis, type ProcessingRow } from "./persist";
import { callWorker } from "./python";
import type { Analysis } from "./contracts";

/** Resume fetched work before spending the remaining budget on acquisition. */
export async function claimProcessing(
  db: PipelineDatabase,
  limit: number
): Promise<ProcessingRow[]> {
  await db.query(`UPDATE public.crawl_queue SET status=CASE WHEN processing_attempts>=5 THEN 'failed' ELSE 'fetched' END, processing_claimed_at=NULL,
    processing_next_retry_at=now(), last_error='stale-processing-claim-released'
    WHERE status='processing' AND processing_claimed_at<now()-interval '15 minutes'`);
  const rows = (
    await db.query(
      `UPDATE public.crawl_queue SET status='processing',
    processing_claimed_at=now(),processing_attempts=processing_attempts+1
    WHERE id IN (SELECT q.id FROM public.crawl_queue q JOIN public.sources s ON s.id=q.source_id
      WHERE s.active AND q.status='fetched' AND q.processing_attempts<5
        AND (q.processing_next_retry_at IS NULL OR q.processing_next_retry_at<=now())
      ORDER BY q.discovered_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT $1)
    RETURNING id,source_id,url,canonical_url,discovered_at,processing_attempts`,
      [limit]
    )
  ).rows;
  const result: ProcessingRow[] = [];
  for (const row of rows) {
    const temp = (
      await db.query(
        `SELECT raw_html FROM public.temp_documents WHERE queue_id=$1
      AND (expires_at IS NULL OR expires_at>now()) ORDER BY id DESC LIMIT 1`,
        [row.id]
      )
    ).rows[0];
    result.push({
      ...row,
      id: Number(row.id),
      source_id: Number(row.source_id),
      raw_html: temp?.raw_html ?? null,
    } as ProcessingRow);
  }
  return result;
}

export async function runProcessing(db: PipelineDatabase, batchSize = 100, browser = false) {
  const runId = (await db.query("INSERT INTO public.crawl_runs DEFAULT VALUES RETURNING id"))
    .rows[0].id;
  let fetched = 0,
    extracted = 0,
    relevant = 0,
    storiesCreated = 0,
    errors = 0,
    completed = 0,
    duplicates = 0,
    rejected = 0;
  try {
    const rows = await claimProcessing(db, batchSize);
    const remaining = batchSize - rows.length;
    if (remaining > 0) {
      const opts = {
        db,
        batchSize: remaining,
        config: browser ? loadBrowserConfig() : loadFetchConfig(),
        quiet: true,
      };
      const batch = await (browser ? fetchBrowserBatch(opts) : fetchBatch(opts));
      fetched = batch.summary.succeeded;
      errors += batch.summary.failed + batch.summary.tempStoreFailed;
      rows.push(...(await claimProcessing(db, remaining)));
    }
    for (const row of rows) {
      try {
        if (!row.raw_html)
          throw new Error("Temporary HTML missing or expired; reacquisition required.");
        const analysis = await callWorker<Analysis>({
          operation: "analyze",
          html: row.raw_html,
          url: row.url,
        });
        const outcome = await persistAnalysis(db, row, analysis);
        extracted += Number(analysis.article.extraction_confidence !== "failed");
        relevant += Number(analysis.relevance.pass);
        storiesCreated += Number(outcome.storyCreated);
        completed += Number(outcome.status === "complete");
        duplicates += Number(outcome.status === "duplicate");
        rejected += Number(outcome.status === "rejected");
      } catch (error) {
        errors++;
        const exhausted = row.processing_attempts >= 5;
        // Lost temp storage requires a new download, not five extraction retries.
        const missingHtml = !row.raw_html;
        await db.query(
          `UPDATE public.crawl_queue SET status=$2,processing_claimed_at=NULL,
          processing_next_retry_at=now()+make_interval(secs=>$3),next_retry_at=now(),last_error=$4,
          processing_diagnostics=processing_diagnostics || '{"fetched":true}'::jsonb
          WHERE id=$1 AND status='processing' AND processing_attempts=$5`,
          [
            row.id,
            exhausted ? "failed" : missingHtml ? "retry" : "fetched",
            Math.min(60 * 2 ** (row.processing_attempts - 1), 3600),
            String(error instanceof Error ? error.message : "processing-failed").slice(0, 500),
            row.processing_attempts,
          ]
        );
      }
    }
    await db.query(
      `UPDATE public.crawl_runs SET completed_at=now(),status=$2,urls_fetched=$3,
      articles_extracted=$4,articles_relevant=$5,stories_created=$6,errors=$7 WHERE id=$1`,
      [runId, errors ? "failed" : "complete", fetched, extracted, relevant, storiesCreated, errors]
    );
    return {
      runId,
      claimed: rows.length,
      fetched,
      extracted,
      relevant,
      storiesCreated,
      completed,
      duplicates,
      rejected,
      errors,
    };
  } catch (error) {
    await db.query(
      "UPDATE public.crawl_runs SET completed_at=now(),status='failed',errors=$2 WHERE id=$1",
      [runId, errors + 1]
    );
    throw error;
  }
}
