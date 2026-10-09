import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Regenerate brand icons from the supplied local Book font.
const font = readFileSync(new URL("../P22Mackinac-Book.woff2", import.meta.url)).toString("base64");
const out = new URL("../public/icons/", import.meta.url);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [name, size, scale] of [
    ["icon-192.png", 192, 0.45],
    ["icon-512.png", 512, 0.45],
    ["icon-maskable-512.png", 512, 0.35],
    ["apple-touch-icon.png", 180, 0.45],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>@font-face{font-family:Mackinac;src:url(data:font/woff2;base64,${font}) format('woff2')}body{margin:0;background:#0d0d0f;color:#f5f5f7;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;font-family:Mackinac,Georgia,serif;font-size:${size * scale}px;line-height:1}span{transform:translateY(-2%)}</style><span>PB</span>`
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: fileURLToPath(new URL(name, out)) });
    await page.close();
  }
} finally {
  await browser.close();
}
