// Crawlee-backed fetch engine (Phase 5).
//
// Crawlee owns: global concurrency pool, HTTP download, redirect
// following, timeouts. Our policy owns everything else: per-domain
// throttle (acquired in preNavigationHooks, released in both handlers),
// outcome classification, and DB persistence. Crawlee's internal retries
// are disabled (maxRequestRetries 0) — retries live in crawl_queue with
// backoff, so they survive process restarts.
//
// HttpCrawler (not CheerioCrawler): CheerioCrawler skips non-HTML/XML
// before user code runs, which would hide content-type decisions from
// our classifier. Here every byte reaches the policy.
import { randomUUID } from "node:crypto";
import { load } from "cheerio";
import { HttpCrawler, Configuration, LogLevel } from "crawlee";
import type { FetchConfig } from "./config";
import { classifyContentType, classifyError, classifyHttpStatus, type FetchOutcome } from "./retry";
import { DomainThrottle } from "./domain-throttle";

/** Broad ignore list: every HTTP response reaches our classifier with its status intact. */
export const HANDLED_STATUS_CODES = [
  400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411, 412, 413, 414, 415, 416, 417, 418,
  421, 422, 423, 424, 425, 426, 428, 429, 431, 451, 500, 501, 502, 503, 504, 505, 506, 507, 508,
  510, 511,
];

export interface FetchResult {
  queueId: number;
  url: string;
  finalUrl: string;
  status: number | null;
  contentType: string | null;
  responseTimeMs: number;
  fetchedAt: Date;
  /** Article HTML on success; null otherwise. The runner copies it into
   * temp_documents (Phase 35, expires in 10 days) — never into permanent rows. */
  html: string | null;
  outcome: FetchOutcome;
}

export type RecordFn = (result: FetchResult) => Promise<void>;

/** District detail pages publish signed attachments on the government S3WAAS CDN. */
export async function officialAttachment(html: string, pageUrl: string): Promise<string | null> {
  if (!/\/(?:notice|document)\//.test(new URL(pageUrl).pathname)) return null;
  const $ = load(html);
  const href = $("a[href]")
    .map((_, el) => $(el).attr("href"))
    .get()
    .find((href) => {
      try {
        const u = new URL(href, pageUrl);
        return (
          u.protocol === "https:" &&
          u.pathname.toLowerCase().endsWith(".pdf") &&
          (u.hostname === new URL(pageUrl).hostname || u.hostname.endsWith(".s3waas.gov.in"))
        );
      } catch {
        return false;
      }
    });
  if (!href) return null;
  const res = await fetch(new URL(href, pageUrl), { signal: AbortSignal.timeout(20000) });
  if (!res.ok || res.headers.get("content-type")?.split(";")[0] !== "application/pdf")
    throw new Error("official-attachment-fetch-failed");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body!.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("official-attachment-over-8mb");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("official-attachment-invalid");
  return "PROJECTBIHAR_PDF_V1:" + bytes.toString("base64");
}

export interface CrawlerDeps {
  config: FetchConfig;
  throttle: DomainThrottle;
  record: RecordFn;
  quiet?: boolean;
}

function header(headers: unknown, name: string): string | null {
  if (headers == null || typeof headers !== "object") return null;
  const rec = headers as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    if (key.toLowerCase() === name) {
      const v = rec[key];
      if (typeof v === "string") return v;
      if (Array.isArray(v) && typeof v[0] === "string") return v[0];
    }
  }
  return null;
}

export function createFetchCrawler(deps: CrawlerDeps) {
  const { config, throttle, record } = deps;
  const slots = new Map<string, () => void>();
  const takeSlot = (request: { id?: string; uniqueKey: string }): (() => void) | undefined => {
    const key = request.id ?? request.uniqueKey;
    const release = slots.get(key);
    slots.delete(key);
    return release;
  };
  const hostOf = (url: string | undefined): string => {
    try {
      return new URL(url ?? "").hostname.toLowerCase() || "unknown-host";
    } catch {
      return "unknown-host";
    }
  };

  const crawler = new HttpCrawler(
    {
      maxConcurrency: config.globalConcurrency,
      maxRequestRetries: 0,
      useSessionPool: false,
      retryOnBlocked: false,
      persistCookiesPerSession: false,
      navigationTimeoutSecs: config.requestTimeoutSecs,
      // Headroom over the download timeout for throttle waits + recording.
      requestHandlerTimeoutSecs: config.requestTimeoutSecs + 60,
      ignoreHttpErrorStatusCodes: HANDLED_STATUS_CODES,
      // Accept every content type at the transport layer: OUR classifier
      // decides success vs safe rejection (unsupported types must reach
      // requestHandler with their status intact, not die in a MIME gate).
      additionalMimeTypes: ["*/*"],
      preNavigationHooks: [
        async ({ request }) => {
          request.userData.startedAt = Date.now();
          const slotId = request.id ?? request.uniqueKey;
          slots.set(slotId, await throttle.acquire(hostOf(request.url)));
        },
      ],
      requestHandler: async ({ request, response, body, contentType }) => {
        const release = takeSlot(request);
        try {
          const startedAt =
            typeof request.userData.startedAt === "number"
              ? request.userData.startedAt
              : Date.now();
          const fetchedAt = new Date();
          const responseTimeMs = fetchedAt.getTime() - startedAt;
          const status = response.statusCode;
          const finalUrl = request.loadedUrl ?? request.url;
          if (status == null) {
            await record({
              queueId: request.userData.queueId as number,
              url: request.url,
              finalUrl,
              status: null,
              contentType: null,
              responseTimeMs,
              fetchedAt,
              html: null,
              outcome: { decision: "retry", status: null, reason: "missing-status" },
            });
            return;
          }
          const outcome = classifyHttpStatus(status, header(response.headers, "retry-after"));
          const responseContentType =
            contentType?.type ?? header(response.headers, "content-type") ?? null;

          if (outcome.decision === "success") {
            if (responseContentType === "application/pdf" && request.userData.official === true) {
              const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
              const valid =
                bytes.length <= 8 * 1024 * 1024 && bytes.subarray(0, 5).toString() === "%PDF-";
              await record({
                queueId: request.userData.queueId as number,
                url: request.url,
                finalUrl,
                status,
                contentType: responseContentType,
                responseTimeMs,
                fetchedAt,
                html: valid ? "PROJECTBIHAR_PDF_V1:" + bytes.toString("base64") : null,
                outcome: valid
                  ? outcome
                  : {
                      decision: "reject-content",
                      status,
                      reason: "official-pdf-invalid-or-over-8mb",
                    },
              });
              return;
            }
            const contentDecision = classifyContentType(
              responseContentType,
              config.acceptContentTypes
            );
            if (contentDecision === "reject-content") {
              await record({
                queueId: request.userData.queueId as number,
                url: request.url,
                finalUrl,
                status,
                contentType: responseContentType,
                responseTimeMs,
                fetchedAt,
                html: null,
                outcome: {
                  decision: "reject-content",
                  status,
                  reason: `content-${responseContentType ?? "unknown"}`,
                },
              });
              return;
            }
            await record({
              queueId: request.userData.queueId as number,
              url: request.url,
              finalUrl,
              status,
              contentType: responseContentType,
              responseTimeMs,
              fetchedAt,
              html:
                request.userData.official === true
                  ? ((await officialAttachment(
                      typeof body === "string" ? body : body.toString(),
                      finalUrl
                    )) ?? (typeof body === "string" ? body : body.toString()))
                  : typeof body === "string"
                    ? body
                    : body.toString(),
              outcome,
            });
            return;
          }
          await record({
            queueId: request.userData.queueId as number,
            url: request.url,
            finalUrl,
            status,
            contentType: responseContentType,
            responseTimeMs,
            fetchedAt,
            html: null,
            outcome,
          });
        } finally {
          release?.();
        }
      },
      failedRequestHandler: async ({ request }, error) => {
        const release = takeSlot(request);
        try {
          const startedAt =
            typeof request.userData.startedAt === "number"
              ? request.userData.startedAt
              : Date.now();
          await record({
            queueId: request.userData.queueId as number,
            url: request.url,
            finalUrl: request.loadedUrl ?? request.url,
            status: null,
            contentType: null,
            responseTimeMs: Date.now() - startedAt,
            fetchedAt: new Date(),
            html: null,
            outcome: classifyError(error),
          });
        } finally {
          release?.();
        }
      },
    },
    new Configuration({
      // A fresh queue id per batch: Crawlee's in-memory storage is shared
      // process-wide, and a reused 'default' queue would dedupe this
      // batch's URLs as already-handled. The DB remains the durable queue.
      defaultRequestQueueId: `fetch-${randomUUID()}`,
      logLevel: deps.quiet === false ? LogLevel.INFO : LogLevel.WARNING,
    })
  );

  return crawler;
}
