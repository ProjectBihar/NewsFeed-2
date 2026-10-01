// Phase 29 completion gate: the homepage renders story clusters correctly
// across desktop, tablet, and mobile viewports against a running server.
//
// Usage:
//   npm run dev            # or `npm run build && npm run start`
//   npm run check:responsive
//
// Checks per viewport: Curated default (9 of 12 demo clusters), grid column
// count (3 / 2 / 1), section navigation, mode switcher counts, switching to
// "All Bihar News" (12 clusters), no horizontal page overflow, and no
// uncaught page errors. Screenshots land in the OS temp dir.
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT_DIR = process.env.SCREENSHOT_DIR ?? join(tmpdir(), "projectbihar-phase29");

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900, columns: 3 },
  { name: "tablet", width: 768, height: 1024, columns: 2 },
  { name: "mobile", width: 375, height: 812, columns: 1 },
];

const NAV_ITEMS = ["Latest", "Topics", "Districts", "Sources", "Archive"];
const CURATED_CLUSTERS = 9;
const ALL_CLUSTERS = 12;

let failures = 0;
function check(label, ok, detail) {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();

try {
  for (const vp of VIEWPORTS) {
    const label = `${vp.name} ${vp.width}x${vp.height}`;
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`${BASE}/?demo=1`, { waitUntil: "load", timeout: 30000 });
    await page.waitForSelector("article.glass-card", { timeout: 10000 });
    await page.waitForTimeout(400); // hydration: feed mode is client state

    // Default mode is Curated: 9 of the 12 fixture clusters render.
    const curatedCards = await page.locator("article.glass-card").count();
    check(
      `${label}: Curated default renders ${CURATED_CLUSTERS} story clusters`,
      curatedCards === CURATED_CLUSTERS,
      `found ${curatedCards}`
    );

    // Responsive grid: 3 / 2 / 1 columns by breakpoint.
    const columns = await page.evaluate(() => {
      const grid = document.querySelector(".grid");
      if (!grid) return 0;
      return getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
    });
    check(
      `${label}: grid renders ${vp.columns} column(s)`,
      columns === vp.columns,
      `got ${columns}`
    );

    // The page itself never scrolls sideways (nav/pills scroll internally).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    check(`${label}: no horizontal page overflow`, overflow <= 1, `${overflow}px`);

    // Section navigation: all five items live since Phase 33 — Districts
    // and Sources link to their indexes, Archive to the paginated archive.
    const navTexts = await page
      .locator('nav[aria-label="Sections"] a, nav[aria-label="Sections"] span')
      .allTextContents();
    const trimmed = navTexts.map((text) => text.trim());
    check(
      `${label}: section nav shows ${NAV_ITEMS.join("/")}`,
      NAV_ITEMS.every((item) => trimmed.includes(item)),
      trimmed.join(" | ")
    );
    const districtLinks = await page
      .locator('nav[aria-label="Sections"] a[href^="/district"]')
      .count();
    check(`${label}: Districts links to the index`, districtLinks === 1, `${districtLinks}`);
    const sourceLinks = await page.locator('nav[aria-label="Sections"] a[href^="/source"]').count();
    check(`${label}: Sources links to the index`, sourceLinks === 1, `${sourceLinks}`);
    const archiveLinks = await page
      .locator('nav[aria-label="Sections"] a[href^="/archive"]')
      .count();
    check(`${label}: Archive links to the archive`, archiveLinks === 1, `${archiveLinks}`);
    const disabled = await page
      .locator('nav[aria-label="Sections"] span[aria-disabled="true"]')
      .count();
    check(`${label}: no disabled nav placeholders left`, disabled === 0, `${disabled} disabled`);

    // Feed mode switcher with plan labels and fixture counts.
    const curated = page.locator('button:has-text("Curated")').first();
    const all = page.locator('button:has-text("All Bihar News")').first();
    const curatedText = (await curated.textContent()) ?? "";
    const allText = (await all.textContent()) ?? "";
    check(
      `${label}: switcher counts (9) / (12)`,
      curatedText.includes(`(${CURATED_CLUSTERS})`) && allText.includes(`(${ALL_CLUSTERS})`),
      `${curatedText.trim()} | ${allText.trim()}`
    );
    const pressed = await page.locator('button[aria-pressed="true"]').count();
    check(
      `${label}: Curated is the pressed default`,
      pressed === 1 && (await curated.getAttribute("aria-pressed")) === "true",
      `${pressed} pressed`
    );

    // Evidence: the default Curated view (pills included) before interacting.
    await page.screenshot({
      path: join(OUT_DIR, `phase29-${vp.name}-curated.png`),
      fullPage: true,
    });

    // Interaction: switching to All Bihar News renders every cluster.
    await all.click();
    await page.waitForTimeout(250);
    const allCards = await page.locator("article.glass-card").count();
    check(
      `${label}: "All Bihar News" renders ${ALL_CLUSTERS} clusters`,
      allCards === ALL_CLUSTERS,
      `found ${allCards}`
    );
    const allPressed = await all.getAttribute("aria-pressed");
    check(
      `${label}: mode switch updates aria-pressed`,
      allPressed === "true",
      `aria-pressed=${allPressed}`
    );

    check(`${label}: no uncaught page errors`, pageErrors.length === 0, pageErrors.join("; "));

    // Evidence: the All Bihar News view after the interaction above.
    await page.screenshot({
      path: join(OUT_DIR, `phase29-${vp.name}-all.png`),
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(
  `\n${failures === 0 ? "PASS" : "FAIL"} — Phase 29 responsive gate; screenshots in ${OUT_DIR}`
);
process.exit(failures === 0 ? 0 : 1);
