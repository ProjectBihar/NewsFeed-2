import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
const base = process.env.BASE_URL ?? "http://localhost:3102";
const out = process.env.SCREENSHOT_DIR ?? join(tmpdir(), "projectbihar-pwa");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 375, height: 900 },
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const externalP22 = [];
  page.on("request", (r) => {
    if (r.url().includes("onlinewebfonts.com")) externalP22.push(r.url());
  });
  assert.equal((await page.goto(base, { waitUntil: "networkidle" })).status(), 200);
  await page.evaluate(() => document.fonts.load('16px "P22 Mackinac"'));
  assert.equal(await page.evaluate(() => document.fonts.check('16px "P22 Mackinac"')), true);
  assert.match(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
    /^"P22 Mackinac"/
  );
  const font = await context.request.get(`${base}/fonts/P22Mackinac-Book.woff2`);
  assert.equal(font.status(), 200);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  assert.equal(
    hash(await font.body()),
    hash(readFileSync(new URL("../P22Mackinac-Book.woff2", import.meta.url)))
  );
  assert.equal(externalP22.length, 0);
  console.log("PASS: supplied local Book font loads without external P22 requests");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await context.request.get(new URL(manifestHref, base).href)).json();
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  for (const icon of manifest.icons) {
    const image = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, icon.src);
    assert.equal(image.join("x"), icon.sizes);
  }
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').count(), 1);
  console.log("PASS: installable manifest, regular/maskable icons and Apple icon");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, { timeout: 20000 });
  const worker = await context.request.get(`${base}/sw.js`);
  assert.match(worker.headers()["cache-control"], /no-store/);
  const session = await context.newCDPSession(page);
  const installability = await session.send("Page.getInstallabilityErrors");
  assert.deepEqual(installability.installabilityErrors, []);
  console.log("PASS: Chromium reports no installability errors; worker controls page");
  await page.getByText("Install app", { exact: true }).click();
  assert.equal(await page.getByText(/On iPhone or iPad/).isVisible(), true);
  await page.screenshot({ path: join(out, "pwa-online-mobile.png") });
  await page.goto(`${base}/archive`, { waitUntil: "networkidle" });
  assert.equal((await page.goto(`${base}/admin`)).status(), 401);
  await page.goto(base, { waitUntil: "networkidle" });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    return (
      await Promise.all(
        keys
          .filter((k) => k.startsWith("pb-newsfeed-offline-"))
          .map(async (k) =>
            (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)
          )
      )
    ).flat();
  });
  assert.equal(cached.length, 6);
  assert.equal(cached.includes("/offline.html"), true);
  assert.equal(
    cached.some(
      (p) =>
        p === "/" ||
        p.startsWith("/admin") ||
        p.startsWith("/archive") ||
        p.startsWith("/api") ||
        p.startsWith("/_next")
    ),
    false
  );
  console.log("PASS: offline cache contains only six fixed assets, no news/admin payloads");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.getByRole("heading", { name: "You’re offline" }).isVisible(), true);
  await page.screenshot({ path: join(out, "pwa-offline-mobile.png") });
  await page.goto(`${base}/archive`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.getByRole("heading", { name: "You’re offline" }).isVisible(), true);
  let adminBlocked = false;
  try {
    await page.goto(`${base}/admin`);
  } catch {
    adminBlocked = true;
  }
  assert.equal(adminBlocked, true);
  await context.setOffline(false);
  assert.equal((await page.goto(base, { waitUntil: "networkidle" })).status(), 200);
  assert.equal(
    await page.getByRole("heading", { name: "Bihar News", exact: true }).isVisible(),
    true
  );
  assert.deepEqual(errors, []);
  console.log("PASS: offline public navigation, admin exclusion and fresh online recovery");
} finally {
  await browser.close();
}
