// URL normalisation for discovery dedupe (Phase 4).
//
// Conservative by design: only transformations that are safe for unfamiliar
// publishers. In particular mobile subdomains (m.*, mobile.*) are left
// intact — folding them would invent destructive cross-host mappings.

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "fbclid",
  "gclid",
  "gclsrc",
]);

const AMP_PARAMS = new Set(["amp", "output"]);

function isAmpParam(name: string, value: string): boolean {
  if (name === "amp") return true;
  // ?output=1 is the common mobile/AMP switch on Indian publishers.
  if (name === "output" && value === "1") return true;
  return false;
}

/**
 * Normalise a discovered URL to its canonical form.
 * @param raw absolute or relative URL as found in a feed/section page.
 * @param base base URL for resolving relative links (the endpoint URL).
 * @returns canonical absolute URL, or null when the value is not a usable
 * http(s) URL (invalid input, non-web scheme, unresolvable relative link).
 */
export function normaliseUrl(raw: string, base?: string): string | null {
  const input = raw.trim();
  if (!input) return null;
  // Reject obvious non-URLs before parsing.
  if (/^[\s]*$/.test(input)) return null;

  let parsed: URL;
  try {
    parsed = base ? new URL(input, base) : new URL(input);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  parsed.hostname = parsed.hostname.toLowerCase();
  // Strip default ports so :80/:443 forms collapse.
  if (
    (parsed.protocol === "http:" && parsed.port === "80") ||
    (parsed.protocol === "https:" && parsed.port === "443")
  ) {
    parsed.port = "";
  }

  // Strip a trailing /amp segment (…/story/123/amp → …/story/123).
  if (parsed.pathname === "/amp") {
    parsed.pathname = "/";
  } else if (parsed.pathname.endsWith("/amp/")) {
    parsed.pathname = parsed.pathname.slice(0, -"/amp/".length) || "/";
  } else if (parsed.pathname.endsWith("/amp")) {
    parsed.pathname = parsed.pathname.slice(0, -"/amp".length) || "/";
  }

  // Drop fragments, tracking params, and AMP switches. Sort the survivors
  // so param order never creates a false distinct URL.
  parsed.hash = "";
  const kept: Array<[string, string]> = [];
  parsed.searchParams.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (TRACKING_PARAMS.has(lower)) return;
    if (AMP_PARAMS.has(lower) && isAmpParam(lower, value)) return;
    kept.push([name, value]);
  });
  kept.sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0));
  parsed.search = "";
  for (const [name, value] of kept) {
    parsed.searchParams.append(name, value);
  }

  // Collapse a trailing slash everywhere except the root.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}
