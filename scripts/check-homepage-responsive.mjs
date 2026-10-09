// Responsive verification for the unified seven-day timeline.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SCREENSHOT_DIR ?? join(tmpdir(), "projectbihar-timeline");
const views = [
  { name: "desktop", width: 1280, height: 900, columns: 3 },
  { name: "tablet", width: 768, height: 1024, columns: 2 },
  { name: "mobile", width: 375, height: 812, columns: 1 },
];
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failures = 0;
function check(label, ok) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}`);
  if (!ok) failures++;
}
try {
  for (const view of views) {
    const page = await browser.newPage({ viewport: { width: view.width, height: view.height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${BASE}/?demo=1`, { waitUntil: "networkidle" });
    check(
      `${view.name}: all 11 in-window demo stories`,
      (await page.locator("article.glass-card").count()) === 11
    );
    check(
      `${view.name}: no category strip or mode switch`,
      (await page
        .locator('#topics, button:has-text("Curated"), button:has-text("All Bihar News")')
        .count()) === 0
    );
    const nav = await page.locator('nav[aria-label="Sections"] a').allTextContents();
    check(
      `${view.name}: public navigation`,
      ["Latest", "Districts", "Sources", "Archive"].every((x) => nav.includes(x)) &&
        !nav.includes("Topics")
    );
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      columns: getComputedStyle(document.querySelector(".grid"))
        .gridTemplateColumns.split(" ")
        .filter(Boolean).length,
    }));
    check(
      `${view.name}: ${view.columns} columns without horizontal overflow`,
      layout.columns === view.columns && layout.overflow <= 1
    );
    check(`${view.name}: no browser errors`, errors.length === 0);
    await page.screenshot({ path: join(OUT, `timeline-${view.name}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}
process.exitCode = failures ? 1 : 0;
