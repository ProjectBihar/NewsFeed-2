import type { QueryFn } from "../crawler/fetch/queue-store";
import { storeTempDocument } from "../crawler/retention/temp-store";
import { normaliseUrl } from "../crawler/normalisation/normalise-url";
import type { Analysis, Assignment } from "./contracts";
import type { PipelineDatabase } from "./database";
import { callWorker } from "./python";

export interface ProcessingRow {
  id: number;
  source_id: number;
  url: string;
  canonical_url: string;
  discovered_at: Date | string;
  processing_attempts: number;
  raw_html: string | null;
  discovery_metadata?: { title?: string; published_at?: string; summary_only?: boolean };
}
export type Worker = <T>(request: Record<string, unknown>) => Promise<T>;

async function attachEntities(tx: QueryFn, articleId: unknown, analysis: Analysis) {
  for (const entity of analysis.entities) {
    const id = (
      await tx.query(
        `INSERT INTO public.entities (canonical_name, entity_type, district_id, knowledge_id)
      VALUES ($1,$2,$3,$4) ON CONFLICT (canonical_name) DO UPDATE
      SET knowledge_id=COALESCE(public.entities.knowledge_id,EXCLUDED.knowledge_id) RETURNING id`,
        [entity.canonical_name, entity.type, entity.district, entity.id]
      )
    ).rows[0].id;
    // Same-name geography facets share the foundation's canonical entity;
    // retain every KB identifier so numeric DB IDs never leak into scoring.
    await tx.query(
      `INSERT INTO public.entity_aliases (entity_id, alias, language, alias_type)
      VALUES ($1,$2,'und','knowledge_id') ON CONFLICT DO NOTHING`,
      [id, entity.id]
    );
    for (const [names, language] of [
      [entity.aliases, "en"],
      [entity.hindi_names, "hi"],
      [entity.romanisations, "und"],
    ] as const) {
      for (const alias of names)
        await tx.query(
          `INSERT INTO public.entity_aliases
        (entity_id,alias,language,alias_type) VALUES ($1,$2,$3,'surface') ON CONFLICT DO NOTHING`,
          [id, alias, language]
        );
    }
    await tx.query(
      `INSERT INTO public.article_entities (article_id,entity_id,confidence,evidence)
      VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [articleId, id, analysis.relevance.score, JSON.stringify(analysis.relevance.evidence)]
    );
  }
}

const MEMBER_SELECT = `SELECT a.*, COALESCE(a.published_at,a.first_seen_at) AS published_at,
  s.priority AS source_priority, t.body,
  ARRAY(SELECT DISTINCT ea.alias FROM public.article_entities ae JOIN public.entity_aliases ea
        ON ea.entity_id=ae.entity_id WHERE ae.article_id=a.id AND ea.alias_type='knowledge_id') AS entities,
  CASE WHEN a.district_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[a.district_id] END AS districts
  FROM public.articles a JOIN public.sources s ON s.id=a.source_id
  LEFT JOIN public.temp_documents t ON t.article_id=a.id AND (t.expires_at IS NULL OR t.expires_at>now())`;

/** Serialized assignment + all metadata/story/queue writes form one commit. */
export async function persistAnalysis(
  db: PipelineDatabase,
  row: ProcessingRow,
  analysis: Analysis,
  worker: Worker = callWorker
) {
  return db.transaction(async (tx) => {
    // One global assignment lock avoids two workers creating competing stories.
    await tx.query("SELECT pg_advisory_xact_lock(20261009)");
    const owned = (
      await tx.query(
        `SELECT id FROM public.crawl_queue WHERE id=$1 AND status='processing'
      AND processing_attempts=$2 FOR UPDATE`,
        [row.id, row.processing_attempts]
      )
    ).rows;
    if (!owned.length) throw new Error("Processing claim no longer owned.");
    const diagnostics = {
      fetched: true,
      extracted: analysis.article.extraction_confidence !== "failed",
      relevant: analysis.relevance.pass,
      classifier_version: analysis.classifier_version,
      relevance_evidence: analysis.relevance.evidence,
      warnings: analysis.article.warnings,
    };
    const finish = async (status: string, extra: Record<string, unknown> = {}) =>
      tx.query(
        `UPDATE public.crawl_queue
      SET status=$2, processing_claimed_at=NULL, processing_next_retry_at=NULL, last_error=NULL,
      processing_diagnostics=$3 WHERE id=$1`,
        [row.id, status, JSON.stringify({ ...diagnostics, ...extra })]
      );
    if (analysis.article.body)
      await storeTempDocument(tx, { url: row.url, queueId: row.id, body: analysis.article.body });
    if (
      !diagnostics.extracted ||
      !analysis.article.title ||
      !analysis.article.body ||
      !analysis.relevance.pass ||
      analysis.classification.article_type === "advertorial"
    ) {
      await finish("rejected");
      return { status: "rejected", storyCreated: false };
    }
    const canonical = normaliseUrl(analysis.keys.canonical_url) || row.canonical_url;
    // Canonicals outside the fetched publisher are not trusted.
    const samePublisher =
      new URL(canonical).hostname.replace(/^www\./, "") ===
      new URL(row.canonical_url).hostname.replace(/^www\./, "");
    const canonicalUrl = samePublisher ? canonical : row.canonical_url;
    const published =
      analysis.article.published_at && Number.isFinite(Date.parse(analysis.article.published_at))
        ? new Date(analysis.article.published_at).toISOString()
        : null;
    const stamp = published || new Date(row.discovered_at).toISOString();
    const candidate = {
      ...analysis.keys,
      canonical_url: canonicalUrl,
      source_id: row.source_id,
      headline: analysis.article.title,
      body: analysis.article.body,
      published_at: stamp,
      entities: analysis.entities.map((e) => e.id),
      districts: analysis.districts,
      primary_category: analysis.topic.primary_category,
      event_type: analysis.event.event_type,
    };
    // Exact keys search all history; semantic retrieval stays within seven days.
    const exact = (
      await tx.query(
        `${MEMBER_SELECT} WHERE a.canonical_url=$1 OR a.content_hash=$2
      OR (a.source_id=$3 AND a.headline_hash=$4) ORDER BY a.id LIMIT 1`,
        [canonicalUrl, analysis.keys.content_hash, row.source_id, analysis.keys.headline_hash]
      )
    ).rows;
    const recent = (
      await tx.query(
        `${MEMBER_SELECT} JOIN public.stories st ON st.id=a.story_id
      WHERE st.status='active' AND s.active AND a.bihar_relevance_score>=0.5
      AND COALESCE(a.published_at,a.first_seen_at) BETWEEN $1::timestamptz-interval '7 days'
      AND $1::timestamptz+interval '7 days' ORDER BY a.id LIMIT 2001`,
        [stamp]
      )
    ).rows;
    if (recent.length > 2000)
      throw new Error("Candidate capacity exceeded; narrow retrieval before retrying.");
    const assigned = await worker<Assignment>({
      operation: "assign",
      candidate,
      others: [...exact, ...recent],
    });
    if (assigned.duplicate_of != null) {
      await finish("complete", { duplicate_of: assigned.duplicate_of, reason: assigned.reason });
      return { status: "duplicate", storyCreated: false };
    }
    let storyId = assigned.story_id;
    const storyCreated = storyId == null;
    const district = analysis.districts.length === 1 ? analysis.districts[0] : null;
    if (storyId == null)
      storyId = (
        await tx.query(
          `INSERT INTO public.stories
      (canonical_title,primary_category,event_type,district_id,first_seen_at,last_seen_at)
      VALUES ($1,$2,$3,$4,$5,$5) RETURNING id`,
          [
            analysis.article.title,
            analysis.topic.primary_category,
            analysis.event.event_type,
            district,
            stamp,
          ]
        )
      ).rows[0].id as string;
    const articleId = (
      await tx.query(
        `INSERT INTO public.articles
      (source_id,url,canonical_url,headline,headline_hash,description,language,language_confidence,script_mix,
       published_at,first_seen_at,content_hash,similarity_fingerprint,extraction_confidence,bihar_relevance_score,
       article_type,primary_category,event_type,district_id,story_id,curated)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
        [
          row.source_id,
          row.url,
          canonicalUrl,
          analysis.article.title,
          analysis.keys.headline_hash,
          analysis.article.description?.slice(0, 500) || null,
          analysis.language.language,
          analysis.language.language_confidence,
          analysis.language.script_mix,
          published,
          row.discovered_at,
          analysis.keys.content_hash,
          analysis.fingerprint,
          analysis.article.extraction_confidence,
          analysis.relevance.score,
          analysis.classification.article_type,
          analysis.topic.primary_category,
          analysis.event.event_type,
          district,
          storyId,
          analysis.classification.curated,
        ]
      )
    ).rows[0].id;
    await tx.query(
      "INSERT INTO public.story_articles (story_id,article_id,cluster_score) VALUES ($1,$2,$3)",
      [storyId, articleId, assigned.cluster_score || 0]
    );
    await attachEntities(tx, articleId, analysis);
    await storeTempDocument(tx, {
      url: row.url,
      queueId: row.id,
      articleId: Number(articleId),
      body: analysis.article.body,
    });
    await tx.query(
      `INSERT INTO public.classification_results
      (article_id,classifier_version,category,article_type,event_type,reason_codes)
      VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        articleId,
        analysis.classifier_version,
        analysis.topic.primary_category,
        analysis.classification.article_type,
        analysis.event.event_type,
        JSON.stringify([
          ...analysis.classification.reason_codes,
          ...analysis.topic.reason_codes,
          ...analysis.event.reason_codes,
        ]),
      ]
    );
    const members = (
      await tx.query(
        `${MEMBER_SELECT} WHERE a.story_id=$1 AND s.active
      AND a.bihar_relevance_score>=0.5 AND a.article_type IS DISTINCT FROM 'advertorial' ORDER BY a.id`,
        [storyId]
      )
    ).rows;
    const correction = (
      await tx.query(
        `SELECT new_value FROM public.admin_corrections
      WHERE story_id=$1 AND field_name='canonical_title' ORDER BY id DESC LIMIT 1`,
        [storyId]
      )
    ).rows[0];
    const title = await worker<{ canonical_title: string }>({
      operation: "title",
      members,
      override: correction?.new_value,
    });
    await tx.query("SELECT public.recount_story_metadata($1)", [storyId]);
    await tx.query("UPDATE public.stories SET canonical_title=$2 WHERE id=$1", [
      storyId,
      title.canonical_title,
    ]);
    await finish("complete", {
      article_id: articleId,
      story_id: storyId,
      cluster_score: assigned.cluster_score,
      cluster_evidence: assigned.evidence,
    });
    return { status: "complete", storyCreated };
  });
}
