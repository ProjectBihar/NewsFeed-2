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

describe("Phase 28 — V1 design system migrated verbatim", () => {
  const css = normalize(readFileSync(PUBLIC_CSS, "utf8"));

  it("keeps every V1 light-mode token", () => {
    const tokens = [
      "--bg: #f0ede8",
      "--bg-secondary: #e8e4de",
      "--card: rgba(255, 255, 255, 0.62)",
      "--card-border: rgba(209, 213, 219, 0.35)",
      "--card-hover: rgba(255, 255, 255, 0.78)",
      "--ink: #111827",
      "--ink-secondary: #6b7280",
      "--muted: #9ca3af",
      "--accent: #2563eb",
      "--input-bg: rgba(255, 255, 255, 0.55)",
      "--header-bg: rgba(240, 237, 232, 0.78)",
      "--pill-bg: rgba(255, 255, 255, 0.5)",
      "--glass-highlight: rgba(255, 255, 255, 0.7)",
      "--glass-shadow-1: rgba(0, 0, 0, 0.03)",
      "--glass-shadow-2: rgba(0, 0, 0, 0.06)",
      "--glass-shadow-3: rgba(0, 0, 0, 0.02)",
    ];
    for (const token of tokens) expect(css).toContain(token);
  });

  it("keeps every V1 dark-mode token under .dark", () => {
    expect(css).toContain(".dark {");
    const tokens = [
      "--bg: #0d0d0f",
      "--bg-secondary: #1c1c1e",
      "--card: rgba(44, 44, 46, 0.62)",
      "--card-border: rgba(255, 255, 255, 0.08)",
      "--card-hover: rgba(58, 58, 60, 0.78)",
      "--ink: #f5f5f7",
      "--ink-secondary: #a1a1a6",
      "--muted: #6e6e73",
      "--accent: #0a84ff",
      "--header-bg: rgba(13, 13, 15, 0.78)",
      "--pill-bg: rgba(58, 58, 60, 0.5)",
      "--glass-shadow-2: rgba(0, 0, 0, 0.3)",
    ];
    for (const token of tokens) expect(css).toContain(token);
    expect(css).toContain("color-scheme: light");
    expect(css).toContain("color-scheme: dark");
  });

  it("keeps the V1 glass components, animations, and responsive rules", () => {
    const markers = [
      ".glass-card {",
      "border-radius: 16px", // card radius
      "translatey(-2px)", // card hover lift
      ".dark .glass-card:hover",
      ".glass-input:focus-within",
      ".glass-header {",
      ".glass-pill:hover",
      ".skeleton {",
      ".spinner {",
      "@keyframes shimmer",
      "@keyframes cardenter",
      ".animate-fade-in",
      ".line-clamp-2",
      ".gpu-accel",
      ".scrollbar-hide",
      "animation-delay: 30ms", // staggered card entrance
      "@media (max-width: 640px)",
      "border-radius: 14px", // tighter radius on mobile
      "p22 mackinac", // V1 display font
      "mukta", // V1 Devanagari font
    ];
    for (const marker of markers) expect(css).toContain(marker);
  });

  it("loads Tailwind v4 exactly once, before the fonts import order is kept", () => {
    expect(css).toContain('@import "tailwindcss"');
    const fontImport = css.indexOf("@import url(");
    const tailwindImport = css.indexOf('@import "tailwindcss"');
    expect(fontImport).toBeGreaterThanOrEqual(0);
    expect(tailwindImport).toBeGreaterThan(fontImport);
  });
});

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
