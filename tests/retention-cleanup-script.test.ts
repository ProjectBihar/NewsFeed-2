// Phase 35 — the scheduled cleanup process (scripts/retention-cleanup.mjs).
//
// The script must (a) call exactly the run_retention_cleanup RPC with the
// configured credentials and print the report, and (b) FAIL LOUDLY —
// non-zero exit and a clear message — when it cannot do its job
// (unconfiguration, unreachable host, HTTP error), so a scheduler
// surfaces the problem instead of silently letting storage grow.
import { spawn, type SpawnOptions } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts", "retention-cleanup.mjs");

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run the cleanup script as a child process with a controlled env. */
function runScript(env: Record<string, string>, cwd?: string): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const options: SpawnOptions = {
      cwd,
      env: {
        PATH: process.env.PATH ?? "",
        NODE_ENV: process.env.NODE_ENV ?? "test",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    };
    const child = spawn(process.execPath, [SCRIPT], options);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += String(chunk)));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += String(chunk)));
    child.on("close", (status: number | null) => resolvePromise({ status, stdout, stderr }));
  });
}

let server: Server;
let base = "";
let calls: Array<{
  method?: string;
  url?: string;
  apikey?: unknown;
  authorization?: unknown;
  body?: string;
}> = [];
let respondWith: (res: {
  writeHead: (code: number, headers: Record<string, string>) => void;
  end: (chunk: string) => void;
}) => void;

let emptyCwd = "";

beforeAll(() => {
  emptyCwd = mkdtempSync(join(tmpdir(), "retention-cleanup-test-"));
  respondWith = (res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ deleted: 3, remaining: 5, exempt: 1, ran_at: "2026-10-01T00:00:00+00:00" })
    );
  };
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += String(chunk)));
    req.on("end", () => {
      calls.push({
        method: req.method,
        url: req.url,
        apikey: req.headers.apikey,
        authorization: req.headers.authorization,
        body,
      });
      respondWith(res);
    });
  });
  return new Promise<void>((done) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      base = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolvePromise, reject) =>
    server.close((err) => (err ? reject(err) : resolvePromise()))
  );
  rmSync(emptyCwd, { recursive: true, force: true });
});

describe("Phase 35 — retention cleanup script", () => {
  it("exits non-zero with an honest message when unconfigured", async () => {
    // Isolated cwd: no .env.local to leak configuration from.
    const run = await runScript(
      {
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      },
      emptyCwd
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Supabase is not configured");
    expect(run.stderr).toContain("no cleanup ran");
    expect(run.stdout).toBe("");
  });

  it("calls run_retention_cleanup over PostgREST and prints the report", async () => {
    calls = [];
    respondWith = (res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          deleted: 3,
          remaining: 5,
          exempt: 1,
          ran_at: "2026-10-01T00:00:00+00:00",
        })
      );
    };
    const run = await runScript({
      NEXT_PUBLIC_SUPABASE_URL: base,
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
    expect(run.status).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("/rest/v1/rpc/run_retention_cleanup");
    expect(calls[0].apikey).toBe("test-service-key");
    expect(calls[0].authorization).toBe("Bearer test-service-key");
    expect(calls[0].body).toBe("{}");
    expect(run.stdout).toContain("deleted=3 remaining=5 exempt=1");
  });

  it("exits non-zero when the RPC answers with an error", async () => {
    respondWith = (res) => {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "function exploded" }));
    };
    const run = await runScript({
      NEXT_PUBLIC_SUPABASE_URL: base,
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("HTTP 500");
    expect(run.stderr).toContain("run_retention_cleanup failed");
  });

  it("exits non-zero when the configured host is unreachable", async () => {
    // Grab a port that is guaranteed not to accept connections.
    const probe = createServer();
    await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
    const { port } = probe.address() as AddressInfo;
    await new Promise<void>((done) => probe.close(() => done()));

    const run = await runScript({
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
      SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("could not reach");
  });

  it("refuses an anon key before making any cleanup request", async () => {
    calls = [];
    const run = await runScript(
      {
        NEXT_PUBLIC_SUPABASE_URL: base,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-key",
      },
      emptyCwd
    );
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("SUPABASE_SERVICE_ROLE_KEY missing");
    expect(calls).toHaveLength(0);
  });
});
