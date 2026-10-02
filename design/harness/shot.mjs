import { chromium } from "/home/claude/gc-render/node_modules/playwright/index.mjs";
const [,, page_, out, w = "1500", h = "1400"] = process.argv;
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: +w, height: +h }, reducedMotion: "reduce" });
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
await p.goto("file://" + process.cwd() + "/" + page_); await p.waitForTimeout(600);
await p.screenshot({ path: out, fullPage: true }); console.log("errors:", errs); await b.close();
