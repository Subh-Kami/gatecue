import assert from "node:assert/strict";
import { planTrip, checkFlightAgainstGoal, relative } from "../server/plan.js";

const tz = "America/Los_Angeles";
// Seattle -> San Francisco, Thu Oct 15 2026 (PDT = UTC-7)
const base = {
  goalTime: "2026-10-15T11:00:00-07:00",
  goalPlace: "Market St office",
  origin: "Home, Capitol Hill",
  pickupStop: "Sam's place",
  flight: { number: "AS 1234", from: "SEA", to: "SFO", departure: "2026-10-15T07:00:00-07:00", arrival: "2026-10-15T09:05:00-07:00" },
  timeZone: tz,
  driveMinutes: 28,
  pickupDetourMinutes: 7,
  checkinCutoffMinutes: 45,
  walkToCheckinMinutes: 5,
  bufferMinutes: 15,
  deplaneMinutes: 15,
  arrivalToVenueMinutes: 35,
};

const p = planTrip(base);
const byId = Object.fromEntries(p.steps.map((s) => [s.id, s.display]));
assert.equal(byId.cutoff, "6:15 AM");
assert.equal(byId.checkin, "6:00 AM");
assert.equal(byId.airport, "5:55 AM");
assert.equal(byId.leave, "5:20 AM"); // 5:55 - 28 - 7
assert.equal(byId.venue, "9:55 AM");
assert.equal(p.slackMinutes, 65);
assert.equal(p.feasible, true);

// The AM/PM trap: a 6:30 PM flight must be flagged as missing an 11 AM goal.
const now = new Date("2026-10-15T05:30:00-07:00");
const pm = checkFlightAgainstGoal(
  { number: "AS 1250", from: "SEA", to: "SFO", departure: "2026-10-15T18:30:00-07:00", arrival: "2026-10-15T20:40:00-07:00" },
  base.goalTime, tz, 15, 35, now,
);
assert.equal(pm.departureDisplay, "6:30 PM");
assert.equal(pm.departsIn, "in 13 hours");
assert.equal(pm.makesGoal, false);
assert.match(pm.warning!, /8:40 PM, after your meeting at 11 AM/);

const am = checkFlightAgainstGoal(
  { number: "AS 1240", from: "SEA", to: "SFO", departure: "2026-10-15T08:15:00-07:00", arrival: "2026-10-15T10:20:00-07:00" },
  base.goalTime, tz, 15, 35, now,
);
assert.equal(am.makesGoal, false, "10:20 land + 50 min = 11:10, misses by 10 min");
assert.equal(am.marginMinutes, -10);

assert.equal(relative(new Date(0), new Date(90 * 60_000)), "in 1 hour 30 minutes");
assert.equal(relative(new Date(0), new Date(14 * 60_000)), "in 14 minutes");
console.log("plan.test.ts: all assertions passed");
