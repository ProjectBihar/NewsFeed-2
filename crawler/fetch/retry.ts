// Retry classification (Phase 5). Pure: every plan-mandated case maps to
// exactly one decision, independent of the HTTP client in use.

export type FetchDecision = "success" | "retry" | "permanent" | "blocked" | "reject-content";

export interface FetchOutcome {
  decision: FetchDecision;
  /** HTTP status when a response existed, else null. */
  status: number | null;
  reason: string;
  /** Honoured Retry-After, seconds, when present and sane. */
  retryAfterSecs?: number;
}

/** Parse a Retry-After header (delta-seconds or HTTP date) into seconds. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n >= 0 && n <= 3600 ? n : 3600;
  }
  const t = Date.parse(v);
  if (!Number.isNaN(t)) {
    const secs = Math.round((t - Date.now()) / 1000);
    if (secs < 0) return 0;
    return Math.min(secs, 3600);
  }
  return null;
}

/** Classify a completed HTTP response (5xx/429/404/403/…) by status. */
export function classifyHttpStatus(
  status: number,
  retryAfterHeader: string | null = null
): FetchOutcome {
  if (status >= 200 && status < 300) {
    return { decision: "success", status, reason: `http-${status}` };
  }
  if (status === 408) {
    return { decision: "retry", status, reason: "http-408-timeout" };
  }
  if (status === 429) {
    const retryAfterSecs = parseRetryAfter(retryAfterHeader) ?? undefined;
    return { decision: "retry", status, reason: "http-429-rate-limited", retryAfterSecs };
  }
  if (status >= 500 && status <= 599) {
    return { decision: "retry", status, reason: `http-${status}-server-error` };
  }
  if (status === 404 || status === 410) {
    return { decision: "permanent", status, reason: `http-${status}-gone` };
  }
  if (status === 403 || status === 401) {
    // Recorded separately (queue status 'blocked'); browser fallback only
    // when a source is explicitly configured for it (Phase 6).
    return { decision: "blocked", status, reason: `http-${status}-blocked` };
  }
  if (status >= 400 && status < 500) {
    return { decision: "permanent", status, reason: `http-${status}-client-error` };
  }
  if (status >= 300 && status < 400) {
    // The client follows redirects; a bare 3xx here is unexpected.
    return { decision: "retry", status, reason: `http-${status}-redirect` };
  }
  return { decision: "retry", status, reason: `http-${status}-unexpected` };
}

const RETRY_ERROR_HINTS = [
  "etimedout",
  "esockettimedout",
  "timeout",
  "timed out",
  "econnreset",
  "econnrefused",
  "econnaborted",
  "enotfound",
  "enetunreach",
  "eai_again",
  "socket hang up",
  "temporarily unavailable",
  "aborterror",
];

/**
 * Classify a transport failure (timeout, DNS, refused connection…).
 * Without a response there is nothing permanent to conclude: bounded
 * retry, with the attempt cap enforced by the caller.
 */
export function classifyError(error: unknown): FetchOutcome {
  const message = (
    error instanceof Error
      ? `${error.name}: ${error.message} ${(error as { code?: unknown }).code ?? ""}`
      : String(error)
  ).toLowerCase();
  const recognised = RETRY_ERROR_HINTS.some((hint) => message.includes(hint));
  return {
    decision: "retry",
    status: null,
    reason: recognised
      ? `network-error: ${message.slice(0, 120)}`
      : `unknown-error-retry: ${message.slice(0, 120)}`,
  };
}

/** Accept only article HTML; feeds/images/pdfs reject safely (terminal, not failure). */
export function classifyContentType(contentType: string | null, accepted: string[]): FetchDecision {
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return accepted.includes(type) ? "success" : "reject-content";
}
