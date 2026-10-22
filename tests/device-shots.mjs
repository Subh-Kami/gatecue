import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
mkdirSync("dist/shots", { recursive: true });
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" };
const srv = createServer((req, res) => {
  const p = join("dist/host", new URL(req.url, "http://x").pathname.replace(/\/$/, "/index.html"));
  let b; try { b = readFileSync(p); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); res.end(b);
}).listen(5174);
// Run against a demo server with a fast clock so the check-in nudge arrives in time: GATECUE_DEMO_SPEEDUP=20 npm run serve:demo
const BASE = process.env.BASE ?? "http://localhost:8787";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const only = process.argv[2];
const runs = [
  { name: "01-plan", device: "echo-show-8", scene: "night", script: ["I need to be at an 11 AM meeting in San Francisco tomorrow"] },
  { name: "02-ride", device: "echo-show-8", scene: "night", script: ["Book the ride"], modal: true },
  { name: "03-ride-booked", device: "echo-show-8", scene: "night", script: ["Book the ride"], confirmModal: true },
  { name: "04-nudge", device: "echo-show-8", script: ["Watch my check-in time"], waitNudge: true },
  { name: "05-options", device: "echo-show-8", script: ["My flight got cancelled"] },
  { name: "06-review-ok", device: "echo-show-8", script: ["Show me flights", "Review BL 499 at 7:11 AM"] },
  { name: "07-pm-trap", device: "echo-show-8", script: ["Just book the 6 o'clock"] },
  { name: "08-ack-sheet", device: "echo-show-8", script: ["Just book the 6 o'clock", "Book it anyway"], modal: true },
  { name: "09-phone-trap", device: "mobile", script: ["Just book the 6 o'clock"] },
  { name: "10-phone-plan", device: "mobile", scene: "night", script: ["I need to be at an 11 AM meeting in San Francisco tomorrow"] },
  { name: "11-show15-light", device: "echo-show-15", theme: "light", script: ["My flight got cancelled"] },
  { name: "12-voice", device: "voice", script: ["Just book the 6 o'clock"] },
].filter((r) => !only || r.name.includes(only));
const errors = {};
for (const r of runs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 980 }, deviceScaleFactor: 1 });
  errors[r.name] = [];
  page.on("pageerror", (e) => errors[r.name].push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors[r.name].push(m.text()); });
  const url = `http://localhost:5174/?server=${BASE}&device=${r.device}&theme=${r.theme ?? "dark"}&scene=${r.scene ?? "airport"}&script=${encodeURIComponent(r.script.join("|"))}`;
  await page.goto(url);
  if (r.modal || r.confirmModal) {
    await page.waitForSelector("#modal:not([hidden]) .sheet2", { timeout: 30000 });
    page.on("popup", (pp) => pp.close().catch(() => {}));
    await page.waitForTimeout(700);
    if (r.confirmModal) {
      await page.click("#modal #go, #modal button[type=submit]");
      await page.waitForSelector("body[data-script-done='1']", { timeout: 30000 });
      await page.waitForTimeout(2200);
    }
  } else {
    await page.waitForSelector("body[data-script-done='1']", { timeout: 40000 });
    if (r.waitNudge) await page.waitForSelector("body[data-nudged='1']", { timeout: 30000 });
    await page.waitForTimeout(2600); // let entrance motion finish
  }
  await page.screenshot({ path: `dist/shots/${r.name}.png` });
  if (r.caption) { await page.evaluate(() => document.querySelector("#caption").classList.add("on")); }
  await page.close();
}
console.log(JSON.stringify(errors));
await browser.close(); srv.close();
