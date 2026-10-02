# GateCue

![GateCue: an Alexa+ travel co-pilot](docs/hero.png)

**An Alexa+ add-on that plans your travel day backwards from what matters, watches the clock for you, and checks AM from PM before you pay.**

Built for the Amazon Developer Hackathon 2026 (Alexa+ track). GateCue is a self-hosted MCP server with MCP Apps cards, plus an Alexa+ simulator to run it in.

## Why

The night before a work trip, the flight was at 6:39 AM. At the airport with time to spare, or so it seemed: check-in closed at 6:24 AM, and it was missed by two minutes. Rebooking in a panic at the gate, the "6:30" flight turned out to be 6:30 **PM**. Non-refundable. The meeting was gone too.

Every app involved was working as designed. None of them knew what the day was *for*. GateCue does:

- **Plans backwards from the goal.** "I need to be at an 11 AM meeting in San Francisco" becomes leave home 4:59 AM, be at check-in 5:39 AM, check-in closes 5:54 AM, with real drive time in traffic and your own buffer.
- **Watches the clock and speaks first.** In the food court at 5:32, Alexa says check-in closes in 22 minutes and it's a 6-minute walk. Leave now.
- **Is panic-proof when you rebook.** Ask for "the 6 o'clock" and GateCue shows you that it's 5:55 **PM**, this evening, and it lands after your meeting, before any money moves. Booking a flight that misses the goal needs an explicit "yes, I'll miss my meeting".

## What it does

| Tool | What it does | Card |
| --- | --- | --- |
| `get_trip_context` | What GateCue remembers: next trip, home, people, preferences (DynamoDB) | none |
| `plan_trip` | The day, backwards from the goal, with an Amazon Location drive time | Timeline over a painted panorama |
| `update_preferences` | Remembers "I like 20 minutes of buffer" for every future plan | none |
| `search_flights` | Today's remaining flights, marking which still make the goal; "the 6 o'clock" shows AM and PM side by side | Departure-board carousel |
| `review_flight` | The panic-proof check: day, AM/PM, "in 13 hours", makes the meeting or not, refund rule | Review card |
| `book_flight` | Pays through a secure checkout page (URL elicitation); a miss needs an explicit acknowledgement | Boarding pass |
| `book_ride` | Ride with a pickup stop, confirmed through a form elicitation | Ride card |
| `watch_trip` | A background Task that speaks up when it's time to move | Live countdown ring |
| `get_flight_status` | Live status, gate and delays (AeroDataBox) | none |
| `email_trip_plan` | Emails the plan (Amazon SES); bookings are emailed automatically | none |

Every time GateCue says or shows carries AM or PM and the day. AM is tagged sunrise gold, PM dusk violet, in speech captions, cards and emails.

## Run it (no keys needed)

Requires Node 22.9+.

```bash
npm install
npm run build          # cards and simulator
npm run serve:demo     # MCP server at http://localhost:8787/mcp, demo clock set to 5:30 AM on Oct 15
```

Open **http://localhost:8787/sim/** and try:

1. "I need to be at an 11 AM meeting in San Francisco" (scene: *the night before*)
2. "Book the ride"
3. "Watch my check-in time" (scene: *at the airport*)
4. "My flight got cancelled", then "Just book the 6 o'clock"

Without keys, GateCue uses a built-in illustrative flight schedule, a local test checkout page, and estimated drive times, and keeps memory in-process. Add keys to switch each part to the real service (see `.env.example`):

| Setting | Turns on |
| --- | --- |
| `RAPIDAPI_KEY` | Live schedules and flight status from AeroDataBox |
| `STRIPE_SECRET_KEY` (test mode only) | Real Stripe Checkout; the server refuses live keys |
| `GC_AWS=1` + `aws login` | DynamoDB memory, Amazon Location drive times, Amazon SES email |
| `GC_TRAVELLER_EMAIL` | Where trip emails go (must be verified while SES is in sandbox) |
| `ANTHROPIC_API_KEY` or `GC_BRAIN=bedrock` | A real model drives the simulator instead of the scripted demo |

## How it fits together

```
 Alexa+ (or our simulator)                       GateCue MCP server (Node, Streamable HTTP, spec 2025-11-25)
 ┌──────────────────────────┐   tools/call      ┌──────────────────────────────────────────────────────────┐
 │ model picks tools        │ ───────────────▶  │ plan · search · review · book · watch · memory · email   │
 │ renders MCP Apps cards   │ ◀─ ui:// cards ── │ MCP Apps resources (sandboxed iframes, declared CSP)     │
 │ shows elicitation sheets │ ◀─ form / URL ─── │ form + URL elicitation, Tasks (watch_trip)              │
 └──────────────────────────┘                   └───────────────┬──────────────────────────────────────────┘
                                                                 │
              Amazon DynamoDB (memory) · Amazon Location Service (routes) · Amazon SES (email)
              Amazon Bedrock (Nova / Claude, simulator brain) · AeroDataBox (flights) · Stripe (test checkout)
```

- **`server/`** The MCP server. `plan.ts` is pure planning logic (unit-tested). `gatecue.ts` registers tools and cards. `memory.ts` (DynamoDB), `location.ts` (Amazon Location Routes v2), `mailer.ts` (SES v2) and `agent.ts` (Bedrock Converse or Anthropic Messages, switchable) each fall back gracefully when their service is off.
- **`views/`** The MCP Apps cards: plain TypeScript and CSS, bundled to single HTML files. Illustrations load from the server's `/assets`, declared in each card's `_meta.ui.csp.resourceDomains`.
- **`host/`** The Alexa+ simulator: an MCP host that renders cards through AppBridge in sandboxed iframes, handles elicitations and Tasks, and emulates Echo Show 8, Echo Show 15, phone and voice-only.
- **`design/`** Art direction, illustration masters and the motion language (`design/ART_DIRECTION.md`).

## AWS services

| Service | Used for | Code |
| --- | --- | --- |
| Amazon DynamoDB | Cross-session memory: traveller profile, saved places, preferences, trips (rebooking updates the trip) | `server/memory.ts` |
| Amazon Location Service | Traffic-aware drive time home → pickup stop → airport at the planned departure time | `server/location.ts` |
| Amazon SES | Plan and booking emails, with the same AM/PM tagging as the cards | `server/mailer.ts` |
| Amazon Bedrock | Converse API brain for the simulator (Nova 2 Lite by default; Claude on Bedrock via `GC_MODEL`) | `server/agent.ts` |

`npm run check:aws` and `npm run test:aws` verify each one against your logged-in account without printing credentials.

## Tests

```bash
npm test               # unit tests + end-to-end MCP protocol test against a fresh demo server
npm run test:agent     # the simulator driven by a model (a mock Anthropic API, no key needed)
npm run test:aws       # live DynamoDB, Location and Bedrock checks (needs aws login)
npm run test:email     # sends one real plan email through SES
```

The end-to-end test negotiates protocol 2025-11-25, checks every tool's output schema and card resource, and runs the full story: plan, search, the PM trap, both elicitation types, checkout with its completion notification, and the `watch_trip` Task.

## Pinned versions

- `@modelcontextprotocol/sdk` 1.30 (protocol 2025-11-25). The v2 packages target 2026-07-28, which Alexa+ doesn't speak.
- `@modelcontextprotocol/ext-apps` 1.7.5 (2.0 requires the v2 SDK). See `FRICTION_LOG.md`.

## Honest about what's simulated

- Fares and refund rules are simulated (there is no public fare API); every option says `fareSource: "simulated"`.
- Ride booking is simulated. Payments are Stripe **test mode** only.
- The keyless demo schedule is illustrative. With `RAPIDAPI_KEY`, schedules and status are live.

## Credits and license

Code: Apache License 2.0 (`LICENSE`). Illustrations and loops were generated for this project (see `assets/CREDITS.md`) and are not covered by the code license. Font: Noto Sans (SIL OFL). Flight data by [AeroDataBox](https://aerodatabox.com/).
