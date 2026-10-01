// Fetch configuration (Phase 5). Conservative defaults; every knob has an env override.

export interface FetchConfig {
  /** Global concurrent downloads. */
  globalConcurrency: number;
  /** Concurrent downloads per registrable domain. */
  perDomainConcurrency: number;
  /** Per-request download timeout, seconds. */
  requestTimeoutSecs: number;
  /** Max attempts per queue row before terminal failure. */
  maxAttempts: number;
  /** Base backoff between retries, seconds (exponential). */
  baseBackoffSecs: number;
  /** Backoff ceiling, seconds. */
  maxBackoffSecs: number;
  /** Content types accepted as article HTML. */
  acceptContentTypes: string[];
  userAgent: string;
}

export const DEFAULT_FETCH_CONFIG: FetchConfig = {
  globalConcurrency: 10,
  perDomainConcurrency: 2,
  requestTimeoutSecs: 30,
  maxAttempts: 5,
  baseBackoffSecs: 60,
  maxBackoffSecs: 3600,
  acceptContentTypes: ["text/html", "application/xhtml+xml"],
  userAgent: "Mozilla/5.0 (compatible; ProjectBiharBot/0.1; +acquisition)",
};

function num(env: string | undefined, fallback: number): number {
  if (env == null || env === "") return fallback;
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Defaults overlaid with FETCH_* env vars. Invalid values fall back safely. */
export function loadFetchConfig(
  env: Record<string, string | undefined> = process.env
): FetchConfig {
  return {
    globalConcurrency: num(env.FETCH_MAX_CONCURRENCY, DEFAULT_FETCH_CONFIG.globalConcurrency),
    perDomainConcurrency: num(
      env.FETCH_MAX_CONCURRENCY_PER_DOMAIN,
      DEFAULT_FETCH_CONFIG.perDomainConcurrency
    ),
    requestTimeoutSecs: num(env.FETCH_TIMEOUT_SECS, DEFAULT_FETCH_CONFIG.requestTimeoutSecs),
    maxAttempts: Math.floor(num(env.FETCH_MAX_ATTEMPTS, DEFAULT_FETCH_CONFIG.maxAttempts)),
    baseBackoffSecs: num(env.FETCH_BACKOFF_SECS, DEFAULT_FETCH_CONFIG.baseBackoffSecs),
    maxBackoffSecs: num(env.FETCH_MAX_BACKOFF_SECS, DEFAULT_FETCH_CONFIG.maxBackoffSecs),
    acceptContentTypes: DEFAULT_FETCH_CONFIG.acceptContentTypes,
    userAgent: env.FETCH_USER_AGENT || DEFAULT_FETCH_CONFIG.userAgent,
  };
}

/**
 * Browser fallback config (Phase 6): same shape, deliberately small and
 * slow. Chromium is expensive; concurrency 2 global / 1 per domain.
 */
export function loadBrowserConfig(
  env: Record<string, string | undefined> = process.env,
  base?: FetchConfig
): FetchConfig {
  const fallback = base ?? loadFetchConfig(env);
  return {
    ...fallback,
    globalConcurrency: num(env.BROWSER_MAX_CONCURRENCY, 2),
    perDomainConcurrency: num(env.BROWSER_MAX_CONCURRENCY_PER_DOMAIN, 1),
    requestTimeoutSecs: num(env.BROWSER_TIMEOUT_SECS, 45),
  };
}
