// Scenario suite: tricky travel-day conversations, run over MCP against a keyless demo server.
// Each scenario is what Alexa+ would send after understanding the traveller; we check what GateCue says and does.
// Run: npm test (starts the server), or BASE=http://localhost:8787 npx tsx tests/scenarios.test.ts
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const BASE = process.env.BASE ?? "http://localhost:8787";
const GOAL = "2026-10-15T11:00:00-07:00";
const CQ725 = { number: "CQ 725", from: "SEA", to: "SFO", departure: "2026-10-15T06:39:00-07:00", arrival: "2026-10-15T08:49:00-07:00" };

// How the "traveller" answers confirmation sheets in the current scenario.
let answer: { form?: (p: any) => any; pay?: boolean; handoff?: "accept" | "decline" } = {};
let lastHandoff: any;
const client = new Client({ name: "gatecue-scenarios", version: "1.0.0" }, { capabilities: { elicitation: { form: {}, url: {} }, tasks: {} } as any });
client.setRequestHandler(ElicitRequestSchema, async (req) => {
  const p: any = req.params;
  if (p.mode === "url" && !/checkout/.test(p.url)) { lastHandoff = p; return { action: answer.handoff ?? "accept" }; }
  if (p.mode === "url") {
    const u = new URL(p.url);
    setTimeout(() => fetch(new URL("/checkout/complete", BASE), { method: "POST", body: new URLSearchParams({ e: u.searchParams.get("e")!, paid: answer.pay === false ? "0" : "1" }) }), 200);
    return { action: "accept" };
  }
  return answer.form ? answer.form(p) : { action: "decline" };
});
await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", BASE)));

const clock = (iso: string) => fetch(new URL("/demo/clock", BASE), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ now: iso }) });
const disrupt = (b: object) => fetch(new URL("/demo/disrupt", BASE), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const call = async (name: string, args: object = {}): Promise<any> => client.callTool({ name, arguments: args as any }, CallToolResultSchema, { timeout: 60_000 });
const say = (r: any) => (r.content ?? []).map((c: any) => c.text).join(" ");
const spoken: string[] = [];
const watch = async (args: object): Promise<any> => {
  const stream = client.experimental.tasks.callToolStream({ name: "watch_trip", arguments: args as any }, CallToolResultSchema, { task: { ttl: 5 * 60_000 } } as any);
  for await (const m of stream as any) { if (m.type === "result") return m.result; if (m.type === "error") throw m.error; }
};

let passed = 0;
const results: string[] = [];
async function scenario(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; results.push(`  ✓ ${name}`); }
  catch (e) { results.push(`  ✗ ${name}\n      ${(e as Error).message.split("\n")[0]}`); process.exitCode = 1; }
}
const plan = (over: object = {}) => call("plan_trip", { goalTime: GOAL, goalPlace: "Market St office", origin: "Home, Capitol Hill", pickupStop: "Sam's place", flight: CQ725, ...over });
const search = (over: object = {}) => call("search_flights", { from: "SEA", to: "SFO", goalTime: GOAL, goalPlace: "Market St office", ...over });

await disrupt({ clear: true });
await clock("2026-10-15T03:30:00-07:00");

await scenario("1. Plans backwards from an 11 AM meeting, with a pickup stop", async () => {
  const r = await plan(); spoken.push(say(r));
  assert.match(say(r), /^Leave at 4:59 AM\. You reach Market St office 81 minutes before your meeting\./);
  assert.equal(r.structuredContent.steps.find((s: any) => s.id === "cutoff").display, "5:54 AM");
});

await scenario("2. A trip described in conversation is remembered, and saving it again doesn't duplicate it", async () => {
  const other = { number: "BL 2281", from: "SEA", to: "SFO", departure: "2026-10-20T13:19:00-07:00", arrival: "2026-10-20T15:35:00-07:00" };
  await plan({ goalTime: "2026-10-20T17:00:00-07:00", goalPlace: "Client dinner", pickupStop: undefined, flight: other });
  await plan({ goalTime: "2026-10-20T17:00:00-07:00", goalPlace: "Client dinner", pickupStop: undefined, flight: other });
  const ctx = await call("get_trip_context");
  const dinners = ctx.structuredContent.trips.filter((t: any) => t.goalPlace === "Client dinner");
  assert.equal(dinners.length, 1);
  assert.equal(ctx.structuredContent.trips[0].goalPlace, "Market St office", "soonest trip first");
});

await scenario("3. A lasting buffer preference changes the next plan", async () => {
  const u = await call("update_preferences", { bufferMinutes: 20 }); spoken.push(say(u));
  const r = await plan();
  assert.match(say(r), /^Leave at 4:54 AM/);
  await call("update_preferences", { bufferMinutes: 15 });
});

await scenario("4. An empty preference update asks what to remember", async () => {
  const r = await call("update_preferences", {});
  assert.equal(r.isError, true); assert.match(say(r), /What should I remember/);
});

await scenario("5. Flight search puts flights that make the meeting first, at most five", async () => {
  const r = await search(); spoken.push(say(r));
  const o = r.structuredContent.options;
  assert.ok(o.length <= 5 && o.length > 0);
  const firstMiss = o.findIndex((x: any) => !x.check.makesGoal);
  assert.ok(firstMiss === -1 || o.slice(firstMiss).every((x: any) => !x.check.makesGoal), "no maker after a miss");
  assert.equal(o[0].flight.number, "CQ 725");
});

await scenario('6. "The 6 o\'clock" surfaces the 5:55 PM flight and says it misses the meeting', async () => {
  const r = await search({ departsAround: "6" }); spoken.push(say(r));
  assert.equal(r.structuredContent.options[0].flight.number, "NS 3991");
  assert.match(say(r), /5:55 PM this evening, and it lands after your meeting/);
});

await scenario('7. "The 7:11" finds the morning flight that works', async () => {
  const r = await search({ departsAround: "7:11" });
  assert.equal(r.structuredContent.options[0].flight.number, "BL 499");
  assert.equal(r.structuredContent.options[0].check.makesGoal, true);
});

await scenario("8. The night before, search looks at tomorrow's flights", async () => {
  await clock("2026-10-14T21:40:00-07:00");
  const r = await search(); spoken.push(say(r));
  assert.equal(r.structuredContent.options[0].flight.number, "CQ 725");
  assert.match(say(r), /6:39 AM tomorrow morning/);
  await clock("2026-10-15T03:30:00-07:00");
});

await scenario("9. No flights left before the goal: a friendly answer, not an error dump", async () => {
  await clock("2026-10-15T22:30:00-07:00");
  const r = await search({ goalTime: "2026-10-15T23:59:00-07:00" });
  assert.equal(r.isError, true); assert.match(say(r), /couldn't find any more flights/);
  await clock("2026-10-15T03:30:00-07:00");
});

await scenario("10. Reviewing an option that no longer exists asks to search again", async () => {
  const r = await call("review_flight", { optionId: "nope" });
  assert.equal(r.isError, true); assert.match(say(r), /expired/);
});

await scenario("11. Reviewing the PM flight warns before any payment", async () => {
  const s = await search({ departsAround: "6" });
  const r = await call("review_flight", { optionId: s.structuredContent.options[0].id }); spoken.push(say(r));
  assert.match(say(r), /^Careful\. NS 3991 leaves at 5:55 PM this evening/);
});

await scenario("12. Booking a flight that misses the meeting needs an explicit yes; declining books nothing", async () => {
  const s = await search({ departsAround: "6" });
  const q = (await call("review_flight", { optionId: s.structuredContent.options[0].id })).structuredContent.quoteId;
  let asked = "";
  answer = { form: (p) => { asked = p.message; return { action: "accept", content: { acceptMiss: false } }; } };
  const r = await call("book_flight", { quoteId: q });
  assert.match(asked, /after your meeting/); assert.equal(r.structuredContent.status, "cancelled");
});

await scenario("13. Booking a good flight pays through checkout and the trip remembers the new flight", async () => {
  const s = await search({ departsAround: "7:11" });
  const q = (await call("review_flight", { optionId: s.structuredContent.options[0].id })).structuredContent.quoteId;
  answer = { pay: true };
  const r = await call("book_flight", { quoteId: q }); spoken.push(say(r));
  assert.equal(r.structuredContent.status, "booked");
  const ctx = await call("get_trip_context");
  assert.equal(ctx.structuredContent.trips[0].flight.number, "BL 499");
  await plan(); // put the original flight back for the next scenarios
});

await scenario("14. A failed payment books nothing", async () => {
  const s = await search();
  const q = (await call("review_flight", { optionId: s.structuredContent.options[0].id })).structuredContent.quoteId;
  answer = { pay: false };
  const r = await call("book_flight", { quoteId: q });
  assert.equal(r.structuredContent.status, "not_paid"); assert.match(say(r), /nothing was booked/);
});

await scenario("15. Booking with a stale quote asks to review again", async () => {
  const r = await call("book_flight", { quoteId: "q_gone" });
  assert.equal(r.isError, true); assert.match(say(r), /show you the flight again/);
});

await scenario("16. Saying no to the ride handoff opens nothing", async () => {
  answer = { handoff: "decline" };
  const r = await call("book_ride", { pickup: "Home, Capitol Hill", stop: "Sam's place", dropoff: "SEA", pickupTime: "2026-10-15T04:59:00-07:00" });
  assert.equal(r.structuredContent.status, "cancelled"); assert.match(say(r), /didn't open your ride app/);
});

await scenario("16b. The ride handoff prefills home and the airport, and says to schedule it and add the stop", async () => {
  answer = { handoff: "accept" };
  await clock("2026-10-14T21:40:00-07:00");
  const r = await call("book_ride", { pickup: "Home, Capitol Hill", stop: "Sam's place", dropoff: "SEA", pickupTime: "2026-10-15T04:59:00-07:00" }); spoken.push(say(r));
  const u = new URL(lastHandoff.url);
  assert.equal(u.searchParams.get("pickup[nickname]"), "Home, Capitol Hill");
  assert.ok(u.searchParams.get("dropoff[latitude]"), "airport coordinates filled in");
  assert.match(say(r), /Schedule it for 4:59 AM tomorrow morning and add Sam's place as a stop\./);
  assert.equal(r.structuredContent.status, "handed_off");
  await clock("2026-10-15T03:30:00-07:00");
});

await scenario("16c. A ride sent to the meeting place is corrected to the departure airport", async () => {
  answer = { handoff: "accept" };
  await clock("2026-10-14T21:40:00-07:00");
  const r = await call("book_ride", { pickup: "Home, Capitol Hill", dropoff: "Market St office", pickupTime: "2026-10-15T04:59:00-07:00" }); spoken.push(say(r));
  const u = new URL(lastHandoff.url);
  assert.match(u.searchParams.get("dropoff[nickname]") ?? "", /SEA/);
  assert.ok(u.searchParams.get("dropoff[latitude]"), "airport coordinates filled in");
  assert.equal(r.structuredContent.dropoff, "Seattle-Tacoma International Airport (SEA)");
  await clock("2026-10-15T03:30:00-07:00");
});

await scenario("16d. A new West Coast trip: Seattle to Los Angeles has flights, with AM/PM and a goal check", async () => {
  const r = await call("search_flights", { from: "sea", to: "LAX", goalTime: "2026-10-16T14:00:00-07:00", goalPlace: "Santa Monica studio" }); spoken.push(say(r));
  assert.ok(!r.isError, say(r));
  assert.ok(r.structuredContent.options.length >= 3);
  assert.ok(r.structuredContent.options.every((o: any) => o.flight.from === "SEA" && o.flight.to === "LAX"));
  assert.match(say(r), /\d{1,2}:\d{2} (AM|PM)/);
  const st = await call("get_flight_status", { number: r.structuredContent.options[0].flight.number, date: r.structuredContent.options[0].flight.departure.slice(0, 10) });
  assert.ok(!st.isError, say(st)); assert.equal(st.structuredContent.flights[0].to.iata, "LAX");
});

await scenario("16e. Paris: a clear answer about what GateCue covers, no flights invented", async () => {
  const r = await call("search_flights", { from: "SEA", to: "CDG", goalTime: "2026-10-16T14:00:00+02:00", goalPlace: "Paris office" }); spoken.push(say(r));
  assert.equal(r.isError, true);
  assert.match(say(r), /outside what GateCue covers today/);
  assert.match(say(r), /international/);
  const p = await call("plan_trip", { goalTime: "2026-10-16T14:00:00+02:00", goalPlace: "Paris office", origin: "Home, Capitol Hill", flight: { number: "XX 1", from: "SEA", to: "CDG", departure: "2026-10-15T13:00:00-07:00", arrival: "2026-10-16T08:30:00+02:00" } });
  assert.equal(p.isError, true); assert.match(say(p), /outside what GateCue covers today/);
  const same = await call("search_flights", { from: "SEA", to: "SEA", goalTime: GOAL, goalPlace: "Market St office" });
  assert.match(say(same), /same airport/);
});

await scenario("16f. A goal time in the past (a model's wrong year) gets a correction naming today", async () => {
  const r = await call("search_flights", { from: "SEA", to: "SFO", goalTime: "2023-10-15T11:00:00-07:00", goalPlace: "Market St office" }); spoken.push(say(r));
  assert.equal(r.isError, true); assert.match(say(r), /has already passed\. It's now .* 2026\./);
});

await scenario("16g. After a cancellation, the lost flight is never offered back", async () => {
  const r = await call("search_flights", { from: "SEA", to: "SFO", goalTime: GOAL, goalPlace: "Market St office", excludeFlight: "CQ725" }); spoken.push(say(r));
  assert.ok(r.structuredContent.options.every((o: any) => o.flight.number !== "CQ 725"));
  assert.doesNotMatch(say(r), /CQ 725/);
});

await scenario("17. Flight status reports the gate and AM/PM time", async () => {
  const r = await call("get_flight_status", { number: "CQ 725", date: "2026-10-15" }); spoken.push(say(r));
  assert.match(say(r), /departing 6:39 AM/); assert.ok(r.structuredContent.flights[0].from.gate);
});

const watchArgs = { checkinCloses: "2026-10-15T05:54:00-07:00", walkMinutes: 6, flightNumber: "CQ 725", flightDate: "2026-10-15", goalTime: GOAL, goalPlace: "Market St office" };

await scenario("18. The watcher speaks first when it's time to leave for check-in", async () => {
  await clock("2026-10-15T05:25:00-07:00");
  const r = await watch(watchArgs); spoken.push(say(r));
  assert.equal(r.structuredContent.kind, "nudge"); assert.match(say(r), /Leave now/);
});

await scenario("19. A 40-minute delay: alert says it still makes the meeting", async () => {
  await clock("2026-10-15T04:00:00-07:00");
  const p = watch(watchArgs); await new Promise((r) => setTimeout(r, 400));
  await disrupt({ number: "CQ 725", delayMinutes: 40 });
  const r = await p; spoken.push(say(r)); await disrupt({ clear: true });
  assert.equal(r.structuredContent.change, "delay"); assert.match(say(r), /delayed 40 minutes, leaving at 7:19 AM\. You'd still reach Market St office 41 minutes early/);
});

await scenario("20. A long delay: alert says it now misses the meeting and offers flights", async () => {
  await clock("2026-10-15T04:00:00-07:00");
  const p = watch(watchArgs); await new Promise((r) => setTimeout(r, 400));
  await disrupt({ number: "CQ 725", delayMinutes: 150 });
  const r = await p; spoken.push(say(r)); await disrupt({ clear: true });
  assert.equal(r.structuredContent.makesGoal, false); assert.match(say(r), /minutes late\. Want flights that still make it\?/);
});

await scenario("21. A cancellation: alert offers flights that still make it", async () => {
  await clock("2026-10-15T04:00:00-07:00");
  const p = watch(watchArgs); await new Promise((r) => setTimeout(r, 400));
  await disrupt({ number: "CQ 725", cancelled: true });
  const r = await p; spoken.push(say(r)); await disrupt({ clear: true });
  assert.equal(r.structuredContent.change, "cancelled"); assert.match(say(r), /has been cancelled/);
});

await scenario("22. A gate change: alert names old and new gates", async () => {
  await clock("2026-10-15T04:00:00-07:00");
  const p = watch(watchArgs); await new Promise((r) => setTimeout(r, 400));
  await disrupt({ number: "CQ 725", gate: "D3" });
  const r = await p; spoken.push(say(r)); await disrupt({ clear: true });
  assert.equal(r.structuredContent.change, "gate"); assert.match(say(r), /gate D3, not C12/);
});

await scenario("23. Emailing the plan when email isn't set up says so plainly", async () => {
  const r = await call("email_trip_plan");
  assert.equal(r.isError, true); assert.match(say(r), /Email isn't set up yet/);
});

await scenario("24. Every spoken time in this run carries AM or PM", async () => {
  const bare = spoken.flatMap((t) => [...t.matchAll(/\b\d{1,2}:\d{2}\b(?!\s?[AP]M)/g)].map((m) => `${m[0]} in "${t.slice(0, 60)}…"`));
  assert.deepEqual(bare, []);
});

await client.close();
console.log(`\nScenarios: ${passed} passed\n${results.join("\n")}`);
