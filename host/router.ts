// SCRIPTED ROUTER for the simulator, used when no model is configured (GC_BRAIN=scripted, the keyless default).
// It maps what the traveller says to GateCue tool calls for the demo story (Seattle to San Francisco).
// With a model connected (Amazon Bedrock or the Anthropic API) the model chooses the tools instead.
export type Step = { tool: string; args: Record<string, unknown>; quiet?: boolean } | { say: string };

export interface RouterState { lastOptions: any[]; lastQuoteId?: string; scenario: typeof SCENARIO }

export const SCENARIO = {
  goalTime: "2026-10-15T11:00:00-07:00",
  goalPlace: "Market St office",
  origin: "Home, Capitol Hill",
  pickupStop: "Sam's place",
  flight: { number: "CQ 725", from: "SEA", to: "SFO", departure: "2026-10-15T06:39:00-07:00", arrival: "2026-10-15T08:49:00-07:00" },
  checkinCloses: "2026-10-15T05:54:00-07:00",
};

export function route(text: string, st: RouterState): Step[] {
  const t = text.toLowerCase().trim();
  const s = st.scenario;
  const search = (departsAround?: string) => ({ tool: "search_flights", args: { from: s.flight.from, to: s.flight.to, goalTime: s.goalTime, goalPlace: s.goalPlace, ...(departsAround ? { departsAround } : {}) } });

  // Somewhere other than the story's San Francisco: say plainly what GateCue covers instead of a dead end.
  const dest = t.match(/\b(?:fly|flying|flight|flights|trip|travel|book me|get me)\b[^.?!]*?\bto\s+([a-z][a-z .'-]{1,40})/)?.[1]?.trim();
  if (dest && !/^(san francisco|sf|sfo|the bay|my meeting|the meeting|the airport|my flight|the office|market st)/.test(dest)) {
    const westCoast = /^(seattle|portland|spokane|oakland|san jose|sacramento|reno|los angeles|la|lax|burbank|orange county|san diego|palm springs|las vegas|vegas)\b/.test(dest);
    return [{ say: westCoast
      ? "This scripted demo follows one trip, to San Francisco. With a model connected, GateCue plans and books any West Coast trip like that one."
      : "That trip is outside what GateCue covers today. It plans and books flights between West Coast airports, from Seattle and Portland down to Los Angeles, San Diego and Las Vegas. Trips in other time zones, including international ones, are next." }];
  }
  if (/\b(hotel|hotels|train|trains|rental car|car rental)\b/.test(t)) {
    return [{ say: "GateCue doesn't book hotels, trains or rental cars. It gets you from home to your flight, and to what matters at the other end, on time." }];
  }
  if (/meeting|get me there|need to be/.test(t)) {
    return [{ tool: "plan_trip", args: { goalTime: s.goalTime, goalPlace: s.goalPlace, origin: s.origin, pickupStop: s.pickupStop, flight: s.flight } }];
  }
  if (/ride|uber|lyft|car/.test(t)) {
    return [{ tool: "book_ride", args: { pickup: s.origin, stop: s.pickupStop, dropoff: "SEA", pickupTime: "2026-10-15T04:59:00-07:00" } }];
  }
  const review = t.match(/^review\s+([a-z0-9]{2}\s*\d{1,4})/i);
  if (review) {
    const num = review[1].replace(/\s+/g, "").toUpperCase();
    const o = st.lastOptions.find((x) => x.flight.number.replace(/\s+/g, "").toUpperCase() === num);
    return o ? [{ tool: "review_flight", args: { optionId: o.id } }] : [{ say: "I don't see that flight any more. Let me look again." }, search()];
  }
  if (/^book it|book it anyway|yes,? book/.test(t)) {
    return st.lastQuoteId ? [{ tool: "book_flight", args: { quoteId: st.lastQuoteId } }] : [{ say: "Which flight should I book?" }];
  }
  const clock = t.match(/(?:book|take|get me on)\s+the\s+(\d{1,2}(?::\d{2})?)(?:\s*o'?clock)?/);
  if (clock) return [{ ...search(clock[1]), quiet: true }, { tool: "review_flight", args: { optionId: "$firstOption" } }];
  if (/other flights|flights that make|next flight|cancel+ed|what are my options|show me flights/.test(t)) return [search()];
  if (/email|e-mail|send (me )?(the|my) plan|mail me/.test(t)) return [{ tool: "email_trip_plan", args: {} }];
  if (/watch|keep an eye/.test(t)) return [{ tool: "watch_trip", args: { checkinCloses: s.checkinCloses, walkMinutes: 6, flightNumber: s.flight.number, flightDate: s.flight.departure.slice(0, 10), goalTime: s.goalTime, goalPlace: s.goalPlace } }];
  if (/plan (my|the) day again|re-?plan/.test(t)) return [{ tool: "plan_trip", args: { goalTime: s.goalTime, goalPlace: s.goalPlace, origin: s.origin, pickupStop: s.pickupStop, flight: s.flight } }];
  return [{ say: "In this demo I can plan your travel day, set up the ride, find and check flights, book one, email you the plan, or watch the clock for you. Try: I need to be at an 11 AM meeting in San Francisco tomorrow." }];
}
