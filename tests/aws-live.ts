// Live AWS check for GateCue's own code paths (run on a machine that's logged in to AWS):
// DynamoDB memory (seeds the demo traveller on first run), Amazon Location drive time, and the Bedrock brain.
// Run: npm run test:aws
import assert from "node:assert/strict";
import { getProfile, getTrips, memorySource, findPlace } from "../server/memory.js";
import { driveTime } from "../server/location.js";
import { selectBrain, systemPrompt } from "../server/agent.js";

process.env.GC_AWS = "1";
const ok = (s: string) => console.log(`✓ ${s}`);
const bad = (s: string) => console.log(`✗ ${s}`);

const profile = await getProfile();
const trips = await getTrips();
if (memorySource() === "DynamoDB") ok(`DynamoDB memory: ${profile.name}, buffer ${profile.preferences.bufferMinutes} min, ${trips.length} trip(s)`);
else bad("DynamoDB memory: fell back to in-memory (see the warning above)");

const home = findPlace(profile, "Home, Capitol Hill"), sam = findPlace(profile, "Sam's place"), sea = findPlace(profile, "SEA");
assert.ok(home && sam && sea, "saved places resolve");
const drive = await driveTime(home, sea, sam, new Date("2026-10-15T04:55:00-07:00"));
if (drive) ok(`Amazon Location: home -> Sam's -> SEA at 4:55 AM on Oct 15 = ${drive.minutes} min (legs ${drive.legs.join(" + ")})`);
else bad("Amazon Location: no route (see the warning above)");

const brain = selectBrain({ ...process.env, GC_BRAIN: "bedrock" });
try {
  const out = await brain.turn!(systemPrompt(), [{ role: "user", text: "Reply with exactly: GateCue test OK" }], []);
  ok(`Bedrock brain (${brain.model}): ${out.text}`);
} catch (e) {
  bad(`Bedrock brain (${brain.model}): ${(e as Error).name}: ${(e as Error).message}`);
}
