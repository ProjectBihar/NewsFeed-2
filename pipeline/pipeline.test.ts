import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import type { PipelineDatabase } from "./database";
import { callWorker } from "./python";
import { runDiscovery } from "./discover";
import { claimProcessing } from "./process";
import { persistAnalysis } from "./persist";
import type { Analysis } from "./contracts";
import { storeTempDocument } from "../crawler/retention/temp-store";
import { computeSourceMetrics } from "../crawler/health/metrics";
import { parseBound } from "./cli";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { runProcessing } from "./process";

describe("live pipeline contracts with real SQL and Python", () => {
  let pg: PGlite, db: PipelineDatabase, sourceId: number, analysis: Analysis;
  const url = "https://news.example.com/bihar/cabinet-metro-expansion-101";
  const html = readFileSync("extraction/tests/fixtures/001-thehindu-like.html", "utf8");
  beforeAll(async () => {
    pg = new PGlite();
    const dir = join(process.cwd(), "supabase/migrations");
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pg.exec(readFileSync(join(dir, file), "utf8"));
    await pg.exec("UPDATE sources SET active=false;");
    const query = async (text: string, values?: unknown[]) => ({
      rows: (await pg.query(text, values)).rows as Record<string, unknown>[],
    });
    db = {
      query,
      transaction: (run) =>
        pg.transaction(async (tx) =>
          run({
            query: async (text, values) => ({
              rows: (await tx.query(text, values)).rows as Record<string, unknown>[],
            }),
          })
        ),
    };
    sourceId = Number(
      (
        await db.query(`INSERT INTO public.sources(name,domain,language,scope)
      VALUES ('Pipeline fixture','news.example.com','en','bihar') RETURNING id`)
      ).rows[0].id
    );
    await db.query(
      `INSERT INTO public.source_endpoints(source_id,endpoint_type,url)
      VALUES ($1,'rss','https://news.example.com/feed')`,
      [sourceId]
    );
    analysis = await callWorker<Analysis>({ operation: "analyze", html, url });
  });
  afterAll(async () => {
    await pg?.close();
  });

  it("discovers idempotently and advances checkpoints with committed queue rows", async () => {
    const fetcher = async () => ({
      status: 200,
      contentType: "application/rss+xml",
      text: `<rss version="2.0"><channel><title>Fixture</title><item><title>Metro</title><link>${url}</link></item></channel></rss>`,
    });
    const first = await runDiscovery(db, 200, fetcher);
    expect(first.inserted).toBe(1);
    expect(first.errors).toBe(0);
    expect((await runDiscovery(db, 200, fetcher)).inserted).toBe(0);
    expect(
      (await db.query("SELECT last_seen_url FROM source_endpoints WHERE source_id=$1", [sourceId]))
        .rows[0].last_seen_url
    ).toBe(url);
  });

  it("reports blocked discovery endpoints without advancing their successful cursor", async () => {
    const report = await runDiscovery(db, 200, async () => ({
      status: 403,
      contentType: "text/html",
      text: "Access denied",
    }));
    expect(report.errors).toBe(1);
    expect(report.endpointFailures).toEqual([
      { sourceId, url: "https://news.example.com/feed", error: "http-403" },
    ]);
    expect(
      (await db.query("SELECT last_seen_url FROM source_endpoints WHERE source_id=$1", [sourceId]))
        .rows[0].last_seen_url
    ).toBe(url);
    expect(
      (await db.query("SELECT status FROM crawl_runs WHERE id=$1", [report.runId])).rows[0].status
    ).toBe("failed");
  });

  it("extracts through Python and atomically publishes metadata, joins and evidence", async () => {
    expect(analysis.relevance.pass).toBe(true);
    expect(analysis.topic.primary_category).toBe("Infrastructure");
    const queueId = Number(
      (await db.query("SELECT id FROM crawl_queue WHERE canonical_url=$1", [url])).rows[0].id
    );
    await db.query("UPDATE crawl_queue SET status='fetched',last_attempt_at=now() WHERE id=$1", [
      queueId,
    ]);
    await storeTempDocument(db, { url, queueId, rawHtml: html });
    const [row] = await claimProcessing(db, 1);
    expect(await claimProcessing(db, 1)).toHaveLength(0);
    expect(await persistAnalysis(db, row, analysis)).toEqual({
      status: "complete",
      storyCreated: true,
    });
    const stories = (
      await db.query("SELECT * FROM stories WHERE canonical_title=$1", [analysis.article.title])
    ).rows;
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({ article_count: 1, source_count: 1, district_id: "patna" });
    expect(
      (await db.query("SELECT story_id FROM articles WHERE canonical_url=$1", [url])).rows[0]
        .story_id
    ).toBe(stories[0].id);
    expect(
      (await db.query("SELECT count(*) AS n FROM article_entities")).rows[0].n
    ).toBeGreaterThan(0);
    expect(
      (await db.query("SELECT classifier_version FROM classification_results")).rows[0]
        .classifier_version
    ).toBe(analysis.classifier_version);
    expect(
      (await db.query("SELECT body,expires_at FROM temp_documents WHERE queue_id=$1", [queueId]))
        .rows[0].body
    ).toBe(analysis.article.body);
    const health = await computeSourceMetrics(db, sourceId, 24);
    expect(health.fetch.succeeded).toBe(1);
    expect(health.extraction).toEqual({ attempted: 1, succeeded: 1 });
  });

  it("replays exact content without creating a second publication or story", async () => {
    const secondUrl = "https://news.example.com/repeat";
    const qid = Number(
      (
        await db.query(
          `INSERT INTO crawl_queue(source_id,url,canonical_url,status)
      VALUES ($1,$2,$2,'fetched') RETURNING id`,
          [sourceId, secondUrl]
        )
      ).rows[0].id
    );
    await storeTempDocument(db, { url: secondUrl, queueId: qid, rawHtml: html });
    const [row] = await claimProcessing(db, 1);
    expect((await persistAnalysis(db, row, analysis)).status).toBe("duplicate");
    expect((await db.query("SELECT count(*) AS n FROM articles")).rows[0].n).toBe(1);
    expect(
      (await db.query("SELECT status FROM crawl_queue WHERE id=$1", [qid])).rows[0].status
    ).toBe("complete");
  });

  it("rolls back partial publication when title selection fails", async () => {
    const failUrl = "https://news.example.com/new-event";
    const qid = Number(
      (
        await db.query(
          `INSERT INTO crawl_queue(source_id,url,canonical_url,status)
      VALUES ($1,$2,$2,'fetched') RETURNING id`,
          [sourceId, failUrl]
        )
      ).rows[0].id
    );
    const [row] = await claimProcessing(db, 1);
    const changed = {
      ...analysis,
      keys: { canonical_url: failUrl, content_hash: "different", headline_hash: "different" },
    };
    await expect(
      persistAnalysis(db, row, changed, async <T>(request: Record<string, unknown>) => {
        if (request.operation === "title") throw new Error("fixture title failure");
        return { story_id: null } as T;
      })
    ).rejects.toThrow("fixture title failure");
    expect((await db.query("SELECT count(*) AS n FROM articles")).rows[0].n).toBe(1);
    expect((await db.query("SELECT count(*) AS n FROM stories")).rows[0].n).toBe(1);
    expect(
      (await db.query("SELECT status FROM crawl_queue WHERE id=$1", [qid])).rows[0].status
    ).toBe("processing");
  });

  it("enforces command bounds before opening a database connection", () => {
    expect(parseBound(undefined, 100, 500)).toBe(100);
    for (const input of ["0", "501", "2.5", "Infinity", "1;echo secret"])
      expect(() => parseBound(input, 100, 500)).toThrow();
  });

  it("preserves Hindi text across the worker JSON boundary", async () => {
    const hindi = await callWorker<Analysis>({
      operation: "analyze",
      url: "https://hindi.example/patna",
      html: readFileSync("extraction/tests/fixtures/009-prabhatkhabar-like.html", "utf8"),
    });
    expect(hindi.language.language).toBe("hi");
    expect(hindi.article.title).toMatch(/[\u0900-\u097f]/);
    expect(hindi.article.body).not.toContain("\ufffd");
    expect(hindi.relevance.pass).toBe(true);
  });

  it("groups independent coverage and preserves a manual story title", async () => {
    const source = (
      await db.query(`INSERT INTO sources(name,domain,language,scope)
      VALUES ('Second publisher','second.example','en','bihar') RETURNING id`)
    ).rows[0].id;
    const secondUrl = "https://second.example/metro";
    const qid = Number(
      (
        await db.query(
          `INSERT INTO crawl_queue(source_id,url,canonical_url,status)
      VALUES ($1,$2,$2,'fetched') RETURNING id`,
          [source, secondUrl]
        )
      ).rows[0].id
    );
    const newHtml = html
      .replaceAll(
        "Bihar Cabinet approves Patna Metro expansion",
        "Patna Metro expansion approved by Bihar Cabinet"
      )
      .replace(
        "</article>",
        "<p>Independent reporting confirms that the Patna Metro expansion was approved by the Bihar Cabinet.</p></article>"
      );
    const other = await callWorker<Analysis>({
      operation: "analyze",
      html: newHtml,
      url: secondUrl,
    });
    other.keys.canonical_url = secondUrl;
    const story = (await db.query("SELECT id FROM stories ORDER BY id LIMIT 1")).rows[0].id;
    await db.query(`UPDATE stories SET canonical_title='Reviewed Metro title' WHERE id=$1`, [
      story,
    ]);
    await db.query(
      `INSERT INTO admin_corrections(story_id,field_name,new_value)
      VALUES ($1,'canonical_title','Reviewed Metro title')`,
      [story]
    );
    const [row] = await claimProcessing(db, 1);
    const outcome = await persistAnalysis(db, row, other);
    expect(outcome).toEqual({ status: "complete", storyCreated: false });
    expect(
      (
        await db.query(
          "SELECT canonical_title,article_count,source_count FROM stories WHERE id=$1",
          [story]
        )
      ).rows[0]
    ).toMatchObject({ canonical_title: "Reviewed Metro title", article_count: 2, source_count: 2 });
    expect(
      (await db.query("SELECT status FROM crawl_queue WHERE id=$1", [qid])).rows[0].status
    ).toBe("complete");
  });

  it("runs RSS → real HTTP acquisition → Python → publication within the batch bound", async () => {
    await db.query("UPDATE sources SET active=false");
    const newHtml = html
      .replaceAll(
        "Bihar Cabinet approves Patna Metro expansion",
        "Bihar Cabinet approves new Patna Metro corridor"
      )
      .replace(
        "</article>",
        "<p>The new corridor will have additional stations and a revised construction timetable.</p></article>"
      );
    let origin = "";
    const server = createServer((req, res) => {
      res.setHeader("Content-Type", req.url === "/feed" ? "application/rss+xml" : "text/html");
      res.end(
        req.url === "/feed"
          ? `<rss><channel><item><title>Metro corridor</title><link>${origin}/article</link></item></channel></rss>`
          : newHtml
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const source = (
        await db.query(`INSERT INTO sources(name,domain,language,scope)
        VALUES ('HTTP publisher','127.0.0.1','en','bihar') RETURNING id`)
      ).rows[0].id;
      await db.query(
        "INSERT INTO source_endpoints(source_id,endpoint_type,url) VALUES ($1,'rss',$2)",
        [source, `${origin}/feed`]
      );
      expect((await runDiscovery(db, 1)).inserted).toBe(1);
      const report = await runProcessing(db, 1);
      expect(report).toMatchObject({ claimed: 1, fetched: 1, completed: 1, errors: 0 });
      expect(
        (await db.query("SELECT canonical_url,story_id FROM articles WHERE source_id=$1", [source]))
          .rows[0]
      ).toMatchObject({ canonical_url: `${origin}/article` });
      expect((await runProcessing(db, 1)).claimed).toBe(0);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
  it("publishes relevant tier-D sport reports but continues rejecting advertorials", async () => {
    await db.query("UPDATE sources SET active=true WHERE id=$1", [sourceId]);
    for (const kind of ["sports", "advertorial"]) {
      const testUrl = `https://news.example.com/${kind}-fixture`;
      await db.query(
        `INSERT INTO crawl_queue(source_id,url,canonical_url,status)
        VALUES ($1,$2,$2,'fetched')`,
        [sourceId, testUrl]
      );
      const [row] = await claimProcessing(db, 1);
      const candidate: Analysis = {
        ...analysis,
        article: { ...analysis.article, title: `Bihar ${kind} report`, canonical_url: testUrl },
        keys: {
          ...analysis.keys,
          canonical_url: testUrl,
          content_hash: `${kind}-content`,
          headline_hash: `${kind}-headline`,
        },
        classification: {
          ...analysis.classification,
          article_type: kind,
          significance_tier: "D",
          curated: false,
        },
      };
      const result = await persistAnalysis(
        db,
        row,
        candidate,
        async <T>(request: Record<string, unknown>) =>
          (request.operation === "assign" ? {} : { canonical_title: candidate.article.title }) as T
      );
      expect(result.status).toBe(kind === "sports" ? "complete" : "rejected");
      const published = (
        await db.query("SELECT story_id FROM articles WHERE canonical_url=$1", [testUrl])
      ).rows;
      expect(published).toHaveLength(kind === "sports" ? 1 : 0);
      if (published.length)
        expect(
          (await db.query("SELECT article_count FROM stories WHERE id=$1", [published[0].story_id]))
            .rows[0].article_count
        ).toBe(1);
    }
  });

  it("archives routine crime metadata while marking it excluded from the main timeline", async () => {
    const testUrl = "https://news.example.com/crime-preference-fixture";
    await db.query(
      `INSERT INTO crawl_queue(source_id,url,canonical_url,status)
      VALUES ($1,$2,$2,'fetched')`,
      [sourceId, testUrl]
    );
    const [row] = await claimProcessing(db, 1);
    const candidate: Analysis = {
      ...analysis,
      article: {
        ...analysis.article,
        title: "Three arrested for Patna robbery",
        canonical_url: testUrl,
      },
      keys: {
        ...analysis.keys,
        canonical_url: testUrl,
        content_hash: "crime-preference-content",
        headline_hash: "crime-preference-headline",
      },
      classification: { ...analysis.classification, article_type: "crime" },
      timeline: { excluded: true, reason: "reader-preference:routine-crime" },
    };
    expect(
      (
        await persistAnalysis(
          db,
          row,
          candidate,
          async <T>(request: Record<string, unknown>) =>
            (request.operation === "assign"
              ? {}
              : { canonical_title: candidate.article.title }) as T
        )
      ).status
    ).toBe("complete");
    expect(
      (
        await db.query(
          "SELECT headline,timeline_excluded,timeline_reason FROM articles WHERE canonical_url=$1",
          [testUrl]
        )
      ).rows[0]
    ).toMatchObject({
      headline: candidate.article.title,
      timeline_excluded: true,
      timeline_reason: candidate.timeline!.reason,
    });
  });
});
