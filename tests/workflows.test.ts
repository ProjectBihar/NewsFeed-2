// §§45–51 automation gate: the six workflow files exist with the
// plan's triggers, and every command they reference is runnable
// against committed paths — no placeholders, no invented runners.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), ".github", "workflows");
const FILES = [
  "ci.yml",
  "discover.yml",
  "process.yml",
  "health.yml",
  "maintenance.yml",
  "train.yml",
] as const;

function text(name: string): string {
  return readFileSync(join(DIR, name), "utf8");
}

/** Every `npx vitest run <targets>` / `pytest <targets>` target must exist. */
function referencedTargets(body: string, command: "npx vitest run" | "pytest"): string[] {
  const pattern = new RegExp(`${command}([^\\n#]+)`, "g");
  return [...body.matchAll(pattern)].flatMap((match) =>
    match[1]
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0 && !token.startsWith("-"))
  );
}

describe("§§45–51 — workflow automation contracts", () => {
  it("ships exactly the plan's six workflow files, no monolith", () => {
    for (const file of FILES) {
      expect(existsSync(join(DIR, file)), file).toBe(true);
    }
    const extra = readdirSync(DIR).filter((entry) => entry.endsWith(".yml"));
    expect(extra.sort()).toEqual([...FILES].sort());
  });

  it("ci.yml covers the plan §46 checklist", () => {
    const ci = text("ci.yml");
    for (const needle of [
      "npm run lint",
      "npm run typecheck",
      "npm test",
      "pytest",
      "npm run build",
      "test_golden",
      "db-foundation",
    ]) {
      expect(ci, needle).toContain(needle);
    }
  });

  it("each pipeline workflow declares its plan trigger", () => {
    expect(text("discover.yml")).toContain("*/30 * * * *");
    expect(text("process.yml")).toContain("workflow_dispatch");
    expect(text("process.yml")).toContain("7,37 * * * *");
    expect(text("health.yml")).toContain("*/6");
    expect(text("maintenance.yml")).toContain("23 4 * * *");
    expect(text("train.yml")).toMatch(/\* \* 1/);
    for (const file of FILES) {
      if (file === "ci.yml") continue;
      expect(text(file), `${file} dispatch`).toContain("workflow_dispatch");
    }
  });

  it("every workflow is bounded and cancellable", () => {
    for (const file of FILES) {
      const body = text(file);
      expect(body, `${file} concurrency`).toContain("concurrency:");
      expect(body, `${file} timeout`).toContain("timeout-minutes:");
    }
  });

  it("workflows reference only runnable commands on committed paths", () => {
    const bodies = FILES.map(text).join("\n");
    for (const needle of [
      "TODO",
      "FIXME",
      "placeholder",
      "scripts/discover",
      "scripts/process",
      "scripts/health",
      "scripts/train",
      "tsx ",
      "pip install pyyaml",
    ]) {
      expect(bodies, needle).not.toContain(needle);
    }
    for (const file of FILES) {
      for (const target of referencedTargets(text(file), "npx vitest run")) {
        expect(existsSync(join(process.cwd(), target)), `${file}: ${target}`).toBe(true);
      }
      for (const target of referencedTargets(text(file), "pytest")) {
        expect(existsSync(join(process.cwd(), target)), `${file}: ${target}`).toBe(true);
      }
    }
  });

  it("the process gate stays bounded: no network/Chromium batches", () => {
    const body = text("process.yml");
    expect(body).not.toContain("fetch.test.ts");
    expect(body).not.toContain("browser-fetch");
    expect(body).toContain("batch-size");
  });

  it("live stages are secret-guarded, never faked", () => {
    const body = text("maintenance.yml");
    expect(body).toContain("secrets.NEXT_PUBLIC_SUPABASE_URL");
    expect(body).toContain("npm run retention:cleanup");
    expect(body).toContain("Honest skip");
  });
});
