// End-to-end test against a running server started with GATECUE_DEMO_NOW=2026-10-15T05:30:00-07:00.
// Uses real AeroDataBox schedules (cached) and real Stripe test-mode Checkout sessions.
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ElicitRequestSchema, ElicitationCompleteNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.BASE ?? "http://localhost:8787";
const log = (...a: unknown[]) => console.log("  ", ...a);
const client = new Client({ name: "gatecue-e2e", version: "0.2.0" }, { capabilities: { elicitation: { form: {}, url: {} }, tasks: {} } as any });

const elicitations: any[] = [];
const completed = new Set<string>();
let acceptMiss = false;
let payLocal = true;
client.setRequestHandler(ElicitRequestSchema, async (req) => {
  const p: any = req.params;
  elicitations.push(p);
  if (p.mode === "url" && !/checkout/.test(p.url)) return { action: "accept" }; // ride-app handoff
  if (p.mode === "url") {
    const u = new URL(p.url);
    setTimeout(async () => {
      if (u.hostname === "checkout.stripe.com") await fetch(new URL(`/checkout/cancelled?e=${encodeURIComponent(p.elicitationId)}`, BASE));
      else await fetch(new URL("/checkout/complete", BASE), { method: "POST", body: new URLSearchParams({ e: u.searchParams.get("e")!, paid: payLocal ? "1" : "0" }) });
    }, 400);
    return { action: "accept" };
  }
  const props = p.requestedSchema?.properties ?? {};
  if ("acceptMiss" in props) return { action: "accept", content: { acceptMiss } };
  const content: Record<string, unknown> = {};
  for (const [k, v] of Object.entries<any>(props)) content[k] = v.default ?? v.enum?.[0];
  return { action: "accept", content };
});
client.setNotificationHandler(ElicitationCompleteNotificationSchema, (n) => { completed.add(n.params.elicitationId); });

await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", BASE)));
assert.equal((client as any)._transport?.protocolVersion, "2025-11-25");
const { tools } = await client.listTools();
log("tools:", tools.map((t) => t.name).join(", "));
for (const n of ["plan_trip", "search_flights", "review_flight"]) {
  const uri = (tools.find((t) => t.name === n)!._meta as any)?.ui?.resourceUri as string;
  assert.match(uri, /^ui:\/\/gatecue\/[a-z]+-[0-9a-f]{8}\.html$/, `${n} has content-hashed card URI`);
  const r: any = await client.readResource({ uri });
  assert.equal(r.contents[0].mimeType, "text/html;profile=mcp-app");
}
for (const t of tools) assert.ok(t.outputSchema || t.name === "watch_trip", `${t.name} has outputSchema`);

// plan_trip on the real first flight of the day (CQ 725, 6:39 AM)
const planned: any = await client.callTool({ name: "plan_trip", arguments: {
  goalTime: "2026-10-15T11:00:00-07:00", goalPlace: "Market St office", origin: "Home", pickupStop: "Sam's place",
  flight: { number: "CQ 725", from: "SEA", to: "SFO", departure: "2026-10-15T06:39:00-07:00", arrival: "2026-10-15T08:49:00-07:00" } } });
log("plan_trip:", planned.content[0].text);
assert.equal(planned.structuredContent.feasible, true);

// search_flights: real schedules, best first
const found: any = await client.callTool({ name: "search_flights", arguments: { from: "SEA", to: "SFO", goalTime: "2026-10-15T11:00:00-07:00", goalPlace: "Market St office" } });
log("search_flights:", found.content[0].text);
const opts = found.structuredContent.options;
log("options:", opts.map((o: any) => `${o.flight.number} ${o.check.departureDisplay} ${o.check.makesGoal ? "OK" : "MISS"}`).join(" | "));
assert.ok(opts.length >= 1 && opts.length <= 5);
assert.ok(opts[0].check.makesGoal, "strongest first");
for (let i = 1; i < opts.length; i++) assert.ok(!(opts[i].check.makesGoal && !opts[i - 1].check.makesGoal), "makers before misses");
assert.ok(!/\|/.test(found.content[0].text), "voice text has no pipes");

// review a flight that misses the meeting: the panic-proof path
const miss = opts.find((o: any) => !o.check.makesGoal);
assert.ok(miss, "at least one missing option shown");
const rev: any = await client.callTool({ name: "review_flight", arguments: { optionId: miss.id } });
log("review (miss):", rev.content[0].text);
assert.match(rev.content[0].text, /Careful/);
assert.match(rev.content[0].text, / (AM|PM) /);

// book_flight without accepting the miss -> nothing booked, no checkout opened
acceptMiss = false;
const before = elicitations.length;
const b1: any = await client.callTool({ name: "book_flight", arguments: { quoteId: rev.structuredContent.quoteId } }, CallToolResultSchema, { timeout: 60_000 });
assert.equal(b1.structuredContent.status, "cancelled");
assert.equal(elicitations.length, before + 1, "only the acknowledgement was asked");
log("book_flight (declined miss):", b1.content[0].text);

// review a flight that makes it, then book: Stripe test Checkout opens (the test cancels it)
const rev2: any = await client.callTool({ name: "review_flight", arguments: { optionId: opts[0].id } });
log("review (makes it):", rev2.content[0].text);
const b2: any = await client.callTool({ name: "book_flight", arguments: { quoteId: rev2.structuredContent.quoteId } }, CallToolResultSchema, { timeout: 60_000 });
const urlEl = elicitations.at(-1);
assert.equal(urlEl.mode, "url");
if (new URL(urlEl.url).hostname === "checkout.stripe.com") {
  assert.match(urlEl.url, /cs_test_/);
  assert.equal(b2.structuredContent.status, "not_paid");
  log("book_flight: Stripe test Checkout opened and cancelled ->", b2.content[0].text);
} else {
  assert.equal(b2.structuredContent.status, "booked");
  log("book_flight (local checkout):", b2.content[0].text);
}
await new Promise((r) => setTimeout(r, 100));
assert.ok(completed.has(urlEl.elicitationId), "elicitation completion notice received");

// The AM/PM trap with real schedules: "book the 6 o'clock" when only an evening 6-ish flight is left that day
const trap: any = await client.callTool({ name: "search_flights", arguments: { from: "SEA", to: "SFO", goalTime: "2026-10-15T11:00:00-07:00", goalPlace: "Market St office", departsAround: "6" } });
log("search_flights(departsAround 6):", trap.content[0].text);
const first = trap.structuredContent.options[0];
assert.match(first.check.departureDisplay, /PM$/, "nearest 6 o'clock flight left today is in the evening");
assert.equal(first.check.makesGoal, false);
const rev3: any = await client.callTool({ name: "review_flight", arguments: { optionId: first.id } });
log("review (PM trap):", rev3.content[0].text);
assert.match(rev3.content[0].text, /PM this evening/);

// book_ride
const ride: any = await client.callTool({ name: "book_ride", arguments: { pickup: "Home", stop: "Sam's place", dropoff: "SEA", pickupTime: "2026-10-15T05:00:00-07:00" } });
assert.equal(ride.structuredContent.status, "handed_off");
assert.match(ride.structuredContent.link, /^https:\/\/m\.uber\.com\/ul\/\?/);

// watch_trip Task (server clock runs fast in demo mode)
const stream = client.experimental.tasks.callToolStream({ name: "watch_trip", arguments: { checkinCloses: "2026-10-15T05:54:00-07:00", walkMinutes: 6 } }, CallToolResultSchema, { task: { ttl: 60_000 } } as any);
let result: any;
for await (const m of stream as any) { if (m.type === "result") result = m.result; if (m.type === "error") throw m.error; }
log("watch_trip nudge:", result.content[0].text);
assert.equal(result.structuredContent.kind, "nudge");

await client.close();
console.log("\nE2E: all checks passed");
