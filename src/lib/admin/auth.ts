// Admin auth (Phase 21): HTTP Basic Auth checked in middleware.
//
// The public site stays open; only /admin/* requires credentials.
// Credentials live in env: ADMIN_USERNAME plus ADMIN_PASSWORD_SHA256
// (generate with `npm run admin:hash`). Comparison is constant-time
// over the hashes. No reader accounts, no sessions, no cookies.
//
// WebCrypto keeps the same verifier usable by proxy and server actions.
export interface AdminEnv {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_SHA256?: string;
}

async function sha256Hex(password: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** True when the Authorization header carries valid admin credentials. */
export async function isAuthorized(
  authorization: string | null,
  env: AdminEnv = process.env as AdminEnv
): Promise<boolean> {
  const username = env.ADMIN_USERNAME;
  const expectedHash = (env.ADMIN_PASSWORD_SHA256 ?? "").toLowerCase();
  if (!username || !/^[a-f0-9]{64}$/.test(expectedHash) || !authorization) return false;
  const match = /^Basic\s+(.+)$/.exec(authorization.trim());
  if (!match) return false;
  let decoded: string;
  try {
    decoded = atob(match[1]);
  } catch {
    return false;
  }
  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const userOk = constantTimeEqual(decoded.slice(0, separator), username);
  const passOk = constantTimeEqual(await sha256Hex(decoded.slice(separator + 1)), expectedHash);
  return userOk && passOk;
}

export function unauthorizedResponse(): Response {
  return new Response("Admin access required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ProjectBihar Admin"' },
  });
}
