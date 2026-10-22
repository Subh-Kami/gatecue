// The consent gate: action tools run only when the traveller asked for them (or said yes to an offer).
import { consent } from "../host/consent.ts";
const cases: [string, string, string, boolean][] = [
  ["book_ride", "I need to be at an 11 AM meeting in San Francisco tomorrow", "", false],
  ["book_ride", "Book the ride", "", true],
  ["book_ride", "yes please", "Want me to book the ride?", true],
  ["book_ride", "yes", "Want me to email you the plan?", false],
  ["email_trip_plan", "Email me the plan", "", true],
  ["watch_trip", "Watch my check-in time", "", true],
  ["watch_trip", "My flight got cancelled", "", false],
  ["book_flight", "Just book the 6 o'clock", "", true],
  ["book_flight", "Show me flights", "", false],
  ["book_flight", "Book it anyway", "", true],
  ["plan_trip", "anything", "", true],
  ["search_flights", "My flight got cancelled", "", true],
  ["update_preferences", "I like 20 minutes of buffer", "", true],
];
let bad = 0;
for (const [t, u, a, want] of cases) { const got = consent(t, u, a).ok; if (got !== want) { bad++; console.log("FAIL", t, u, got); } }
if (bad) { console.error(`consent: ${bad} failed`); process.exit(1); } console.log(`consent.test.ts: all ${cases.length} cases passed`);

import { bareClock } from "../host/consent.ts";
const clocks: [string, string | null][] = [
  ["Just book the 6 o'clock", "6"], ["Book the 6:30", "6:30"], ["Get me on the 6 flight", "6"], ["take the 7", "7"],
  ["Book the 6 o'clock in the morning", null], ["Book the 6:30 PM", null], ["I need 20 minutes of buffer", null],
  ["I need to be at an 11 AM meeting", null], ["Review BL 499 at 7:11 AM", null], ["Book it anyway", null],
];
let badC = 0;
for (const [u, want] of clocks) { const got = bareClock(u); if (got !== want) { badC++; console.log("FAIL bareClock", u, got); } }
if (badC) { console.error(`bareClock: ${badC} failed`); process.exit(1); }
console.log(`bareClock: all ${clocks.length} cases passed`);
