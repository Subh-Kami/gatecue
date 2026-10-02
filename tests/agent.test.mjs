// Agent loop test: the simulator driven by a model, with a mock Anthropic API standing in for Claude.
// Checks the wire format we send (tools, tool_use / tool_result pairing, role order) and that the
// tools the "model" picks run through MCP and render cards. No API key or network needed.
// Run: node tests/agent.test.mjs   (starts its own GateCue server on :8788)
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const MOCK = 8799, PORT = 8788;
const requests = [];
let n = 0;
const lastUser = (msgs) => msgs[msgs.length - 1];
const userTexts = (msgs) => msgs.filter((m) => m.role === "user").flatMap((m) => m.content.filter((b) => b.type === "text").map((b) => b.text));

// A tiny deterministic "model".
function policy(body) {
  const msgs = body.messages;
  const last = lastUser(msgs);
  const results = last.content.filter((b) => b.type === "tool_result");
  const said = userTexts(msgs).at(-1) ?? "";
  const use = (name, input) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: `toolu_${++n}`, name, input }] });
  const reply = (text) => ({ stop_reason: "end_turn", content: text ? [{ type: "text", text }] : [] });
  // A new utterance can share a message with the previous turn's last tool_result (valid: results first, then text).
  const fresh = last.content.some((blk) => blk.type === "text");
  if (fresh) assert.ok(last.content.findIndex((blk) => blk.type === "text") >= results.length, "tool_result blocks must come before text");
  if (results.length && !fresh) {
    const r = results[0];
    const prev = msgs[msgs.length - 2].content.find((b) => b.type === "tool_use" && b.id === r.tool_use_id);
    assert.ok(prev, "tool_result must answer the tool_use right before it");
    if (prev.name === "get_trip_context") {
      const data = JSON.parse(r.content.split("\nData: ")[1]);
      const t = data.trips[0];
      return use("plan_trip", { goalTime: t.goalTime, goalPlace: t.goalPlace, origin: t.origin, pickupStop: t.pickupStop, flight: t.flight });
    }
    if (prev.name === "update_preferences") return use("get_trip_context", {});
    return reply(prev.name === "plan_trip" && /buffer/i.test(said) ? "I've re-planned with your new buffer." : "");
  }
  if (/buffer/i.test(said)) return use("update_preferences", { bufferMinutes: 20 });
  if (/meeting/i.test(said)) return use("get_trip_context", {});
  return reply("Sure.");
}

const mock = createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  const body = JSON.parse(raw);
  requests.push(body);
  try {
    assert.equal(req.headers["anthropic-version"], "2023-06-01");
    assert.ok(body.model && body.max_tokens && body.system.includes("GateCue"));
    assert.ok(body.tools.length >= 7 && body.tools.every((t) => t.input_schema?.type === "object" && !("$schema" in t.input_schema)));
    body.messages.forEach((m, i) => { if (i) assert.notEqual(m.role, body.messages[i - 1].role, "roles must alternate"); });
    assert.equal(body.messages[0].role, "user");
    const out = policy(body);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: `msg_${n}`, type: "message", role: "assistant", model: body.model, usage: { input_tokens: 10, output_tokens: 5 }, ...out }));
  } catch (e) {
    console.error("MOCK REJECTED REQUEST:", e.message);
    res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: e.message } }));
  }
}).listen(MOCK);

const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: String(PORT), GATECUE_DEMO_NOW: "2026-10-15T03:30:00-07:00", GC_AWS: "0", GC_BRAIN: "anthropic", ANTHROPIC_API_KEY: "test-key", ANTHROPIC_BASE_URL: `http://localhost:${MOCK}`, RAPIDAPI_KEY: "", STRIPE_SECRET_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = ""; server.stdout.on("data", (d) => (log += d)); server.stderr.on("data", (d) => (log += d));
for (let i = 0; i < 40 && !log.includes("Simulator:"); i++) await new Promise((r) => setTimeout(r, 250));

let failed = false;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const base = `http://localhost:${PORT}`;

  // 1. "Get me to my meeting": context lookup (silent) -> plan_trip card.
  await page.goto(`${base}/sim/?server=${base}&device=echo-show-8&now=2026-10-15T03:30:00-07:00&script=${encodeURIComponent("Get me to my 11 AM meeting")}`);
  await page.waitForSelector("body[data-script-done='1']", { timeout: 30000 });
  assert.equal(await page.getAttribute("body", "data-brain"), "anthropic");
  assert.match(await page.textContent("#status"), /Model: claude-haiku-4-5 \(Anthropic API\)/);
  const card = page.frameLocator("iframe[title='plan_trip card']");
  await card.locator("body").waitFor({ timeout: 10000 });
  const spoken = await page.locator(".turn.alexa:not(.old) .say-text").first().textContent();
  assert.match(spoken, /^Leave at \d{1,2}:\d{2} AM\./);
  assert.equal(await page.locator(".turn.alexa:not(.old)").count(), 1, "one response on screen, context lookup stays silent");
  const firstPlan = requests.find((r) => r.messages.at(-1).content.some((b) => b.type === "tool_result" && r.messages.at(-2).content.some((u) => u.name === "plan_trip" && u.id === b.tool_use_id)));
  const planData1 = JSON.parse(firstPlan.messages.at(-1).content[0].content.split("\nData: ")[1]);
  assert.equal(planData1.bufferMinutes, 15);
  assert.equal(planData1.driveSource, "estimate");

  // 2. A lasting preference is saved, then the plan is redone with it.
  const before = requests.length;
  await page.fill("#utter", "From now on I want 20 minutes of buffer");
  await page.press("#utter", "Enter");
  await page.waitForFunction(() => document.querySelector(".turn.alexa:not(.old) .say-text.add"), null, { timeout: 20000 });
  const later = requests.slice(before);
  const tr = (name) => later.map((r) => ({ r, b: r.messages.at(-1).content.find((x) => x.type === "tool_result" && r.messages.at(-2).content.some((u) => u.name === name && u.id === x.tool_use_id)) })).filter((x) => x.b).at(-1);
  assert.match(tr("update_preferences").b.content, /20 minutes/);
  const planData2 = JSON.parse(tr("plan_trip").b.content.split("\nData: ")[1]);
  assert.equal(planData2.bufferMinutes, 20);
  const leave1 = new Date(planData1.steps[0].at), leave2 = new Date(planData2.steps[0].at);
  assert.equal((leave1 - leave2) / 60000, 5, "5 more minutes of buffer means leaving 5 minutes earlier");
  assert.match(await page.locator(".turn.alexa:not(.old) .say-text.add").textContent(), /re-planned/);

  // 3. Every request carried the whole conversation, in order.
  const lastReq = requests.at(-1);
  assert.ok(userTexts(lastReq.messages).includes("Get me to my 11 AM meeting"));
  assert.deepEqual(errors, []);
  await page.waitForSelector(".turn.alexa:not(.old)[data-ready='1']", { timeout: 10000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "dist/agent-test.png" });
  console.log(`Agent loop test passed (${requests.length} model calls).`);
} catch (e) {
  failed = true;
  console.error("FAIL:", e.message);
  console.error(log.split("\n").slice(-25).join("\n"));
} finally {
  await browser.close(); mock.close(); server.kill();
}
process.exit(failed ? 1 : 0);
