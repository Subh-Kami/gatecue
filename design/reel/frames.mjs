import { chromium } from "/home/claude/gc-render/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const [,, page = "reel.html", secs = "19.5", fps = "30", out = "frames"] = process.argv;
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto("file://" + process.cwd() + "/" + page + "#rec");
await p.evaluate(() => document.fonts.ready); await p.evaluate(() => window.ready()); await p.waitForTimeout(1500);
const n = Math.round(+secs * +fps);
for (let i = 0; i < n; i++) {
  await p.evaluate((t) => (window).seek(t), i / +fps);
  await p.screenshot({ path: `${out}/${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 94 });
}
await b.close(); console.log("frames", n);
