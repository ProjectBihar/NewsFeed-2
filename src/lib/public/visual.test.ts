// Phase 28 completion gate — part 1: the V1 design system migrated verbatim
// into the public stylesheet, and scoped so the admin observatory never
// receives Tailwind (preflight would restyle its unstyled links/buttons).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const PUBLIC_CSS = join(SRC, "app", "(public)", "public.css");
const PUBLIC_LAYOUT = join(SRC, "app", "(public)", "layout.tsx");
const ADMIN_CSS = join(SRC, "app", "admin", "admin.css");
const ADMIN_DIR = join(SRC, "app", "admin");
const ROOT_LAYOUT = join(SRC, "app", "layout.tsx");
const OLD_GLOBALS = join(SRC, "app", "globals.css");

/** Prettier may re-case hexes/quotes and wrap lines; compare loosely. */
function normalize(css: string): string {
  return css.replace(/\s+/g, " ").toLowerCase();
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

describe("Phase 28 — styling is scoped to the public route group", () => {
  it("is the only stylesheet importing Tailwind", () => {
    const withTailwind = walk(SRC)
      .filter((file) => file.endsWith(".css") || file.endsWith(".tsx"))
      .map((file) => ({ file, text: readFileSync(file, "utf8") }))
      .filter(({ text }) => text.includes('@import "tailwindcss"'))
      .map(({ file }) => file.replace(/\\/g, "/"));
    expect(withTailwind).toEqual([PUBLIC_CSS.replace(/\\/g, "/")]);
  });

  it("public layout loads it; root and admin layouts never reference it", () => {
    expect(readFileSync(PUBLIC_LAYOUT, "utf8")).toContain('"./public.css"');
    const root = readFileSync(ROOT_LAYOUT, "utf8");
    expect(root).not.toContain("public.css");
    expect(root).not.toContain("globals.css");
    for (const file of walk(ADMIN_DIR)) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toContain("public.css");
      expect(text).not.toContain("tailwindcss");
    }
  });

  it("admin keeps the body styling that used to live in globals.css", () => {
    expect(existsSync(OLD_GLOBALS)).toBe(false);
    const admin = normalize(readFileSync(ADMIN_CSS, "utf8"));
    expect(admin).toContain("color-scheme: light dark");
    expect(admin).toContain("font-family: system-ui");
    expect(admin).toContain("padding: 2rem");
    expect(admin).toContain("line-height: 1.5");
  });
});
