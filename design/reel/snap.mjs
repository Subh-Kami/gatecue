import { chromium } from "/home/claude/gc-render/node_modules/playwright/index.mjs";
const ts = process.argv.slice(2).map(Number);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
await p.goto("file://" + process.cwd() + "/reel.html#rec");
await p.evaluate(() => document.fonts.ready); await p.evaluate(() => window.ready()); await p.waitForTimeout(1200);
for (const t of ts) { await p.evaluate((t) => window.seek(t), t); await p.screenshot({ path: `/tmp/r-${t}.jpg`, type: "jpeg", quality: 80 }); }
console.log(errs); await b.close();
