import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
const types = { ".html": "text/html", ".js": "text/javascript" };
const srv = createServer((req, res) => {
  const p = join("dist/host", new URL(req.url, "http://x").pathname.replace(/\/$/, "/index.html"));
  let body; try { body = readFileSync(p); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": types[extname(p)] ?? "text/plain" }); res.end(body);
}).listen(5173);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:5173/?server=http://localhost:8787");
await page.waitForSelector("body[data-ready='1']", { timeout: 20000 });
const frame = page.frameLocator("#frame iframe");
await frame.locator("li.cutoff .time").waitFor({ timeout: 10000 });
const cutoff = await frame.locator("li.cutoff .time").textContent();
const heading = await frame.locator("h1").textContent();
await page.waitForTimeout(300);
await page.screenshot({ path: "dist/spike-host.png" });
console.log(JSON.stringify({ heading, cutoff, say: await page.textContent("#say"), errors }, null, 1));
await browser.close(); srv.close();
if (cutoff?.trim() !== "6:15 AM") { console.error("FAIL: card did not render expected cutoff"); process.exit(1); }
console.log("Host render check passed");
