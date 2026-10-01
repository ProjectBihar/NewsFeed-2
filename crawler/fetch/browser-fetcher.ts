// Playwright fallback fetcher (Phase 6).
//
// Same FetchResult contract and DB persistence as the HTTP engine.
// Only rows from requires_browser sources ever reach here (see
// browser-policy.ts + fetchBrowserBatch). Small concurrency, longer
// timeout: Chromium is expensive, never the default path.
import { randomUUID } from "node:crypto";
import { PlaywrightCrawler, Configuration, LogLevel } from "crawlee";
import type { FetchConfig } from "./config";
import { classifyContentType, classifyError, classifyHttpStatus } from "./retry";
import { DomainThrottle } from "./domain-throttle";
import type { RecordFn } from "./fetcher";

export interface BrowserDeps {
  config: FetchConfig;
  throttle: DomainThrottle;
  record: RecordFn;
  quiet?: boolean;
}

export function createBrowserCrawler(deps: BrowserDeps) {
  const { config, throttle, record } = deps;
  const slots = new Map<string, () => void>();
  const takeSlot = (request: { id?: string; uniqueKey: string }) => {
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

  const crawler = new PlaywrightCrawler(
    {
      maxConcurrency: config.globalConcurrency,
      maxRequestRetries: 0,
      useSessionPool: false,
      retryOnBlocked: false,
      navigationTimeoutSecs: config.requestTimeoutSecs,
      requestHandlerTimeoutSecs: config.requestTimeoutSecs + 120,
      launchContext: { launchOptions: { headless: true } },
      preNavigationHooks: [
        async ({ request }) => {
          request.userData.startedAt = Date.now();
          const slotId = request.id ?? request.uniqueKey;
          slots.set(slotId, await throttle.acquire(hostOf(request.url)));
        },
      ],
      requestHandler: async ({ request, response, page }) => {
        const release = takeSlot(request);
        try {
          const startedAt =
            typeof request.userData.startedAt === "number"
              ? request.userData.startedAt
              : Date.now();
          const fetchedAt = new Date();
          const responseTimeMs = fetchedAt.getTime() - startedAt;
          const status = response?.status() ?? null;
          const finalUrl = page.url();
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
          const headers = response?.headers() ?? {};
          const outcome = classifyHttpStatus(status, headers["retry-after"] ?? null);
          const responseContentType = headers["content-type"] ?? null;

          if (outcome.decision === "success") {
            if (
              classifyContentType(responseContentType, config.acceptContentTypes) ===
              "reject-content"
            ) {
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
              html: await page.content(),
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
      defaultRequestQueueId: `browser-${randomUUID()}`,
      logLevel: deps.quiet === false ? LogLevel.INFO : LogLevel.WARNING,
    })
  );

  return crawler;
}
