// Failure-kind classification over crawl_queue.last_error (Phase 19).
// Mirrors the reason strings produced by crawler/fetch/retry.ts; unknown
// shapes fall into "other" rather than crashing the rollup.

export type FailureKind =
  "blocked403" | "rateLimited429" | "timeout" | "serverError" | "permanent" | "other";

/** Strip the attempts-exhausted wrapper, then classify the root cause. */
export function classifyFailureKind(lastError: string | null): FailureKind | null {
  if (!lastError) return null;
  let reason = lastError;
  const exhausted = /^attempts-exhausted:\s*/.exec(reason);
  if (exhausted) reason = reason.slice(exhausted[0].length);
  if (/^http-40[13]\b/.test(reason)) return "blocked403";
  if (/^http-429\b/.test(reason)) return "rateLimited429";
  if (/^http-408\b/.test(reason)) return "timeout";
  if (/^http-5\d\d\b/.test(reason)) return "serverError";
  if (/^http-4\d\d\b/.test(reason)) return "permanent";
  const lower = reason.toLowerCase();
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("network-error") ||
    lower.includes("unknown-error") ||
    lower.includes("econn") ||
    lower.includes("enotfound") ||
    lower.includes("eai_again") ||
    lower.includes("socket hang up")
  ) {
    return "timeout";
  }
  return "other";
}
