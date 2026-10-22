import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import type { TaskStore, TaskMessageQueue } from "@modelcontextprotocol/sdk/experimental/tasks/interfaces.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { planTrip, fmtTime, fmtDay, spokenTime, dayPart, checkFlightAgainstGoal } from "./plan.js";
import { startCheckout } from "./checkout.js";
import { getFlightStatus, aeroEnabled, type FlightStatus } from "./aerodatabox.js";
import { demoScheduleOn } from "./demo-schedule.js";
import { searchFlights, type FlightOption } from "./flights.js";
import { viewUri, viewHtml, VIEW_NAMES } from "./views.js";
import { now, speedup } from "./clock.js";
import { getProfile, getTrips, updatePreferences, findPlace, memorySource, updateTripFlight, saveTrip } from "./memory.js";
import { routeProblem, COVERAGE } from "./airports.js";
import { emailEnabled, travellerEmail, maskEmail, planEmail, bookingEmail, alertEmail, sendEmail } from "./mailer.js";
import { driveTime } from "./location.js";

// Fallbacks when Amazon Location or saved preferences are unavailable. Airline policy data is not wired in yet.
const DEFAULTS = { driveMinutes: 28, pickupDetourMinutes: 7, checkinCutoffMinutes: 45, walkToCheckinMinutes: 5, bufferMinutes: 15, deplaneMinutes: 15, arrivalToVenueMinutes: 35 };
const PICKUP_WAIT_MINUTES = 3; // time at the stop itself when the route already includes the detour
const TZ = "America/Los_Angeles";

const flightShape = {
  number: z.string().describe("Flight number, e.g. CQ 725"),
  from: z.string().describe("Departure airport IATA code, e.g. SEA"),
  to: z.string().describe("Arrival airport IATA code, e.g. SFO"),
  departure: z.string().describe("Departure time, ISO 8601 with UTC offset"),
  arrival: z.string().describe("Arrival time, ISO 8601 with UTC offset"),
};
const checkShape = z.object({
  departureDisplay: z.string(), departureDay: z.string(), departsIn: z.string(), arrivalDisplay: z.string(),
  makesGoal: z.boolean(), marginMinutes: z.number(), warning: z.string().optional(), departureDaySpoken: z.string(),
});
const optionShape = z.object({
  id: z.string(), airline: z.string(), status: z.string(), flight: z.object(flightShape), check: checkShape,
  fareUsd: z.number(), refundable: z.boolean(), fareSource: z.literal("simulated"), durationMinutes: z.number(),
});

interface Quote { id: string; option: FlightOption; goalTime: string; goalPlace: string; createdAt: number }
const options = new Map<string, FlightOption & { goalTime: string; goalPlace: string }>();
const quotes = new Map<string, Quote>();

export interface ServerDeps { taskStore: TaskStore; taskMessageQueue: TaskMessageQueue; publicBaseUrl: string }

// Fixed half-day windows (AeroDataBox allows up to 12 h per call) so repeated searches hit the cache.
// Covers today and, if different, the goal's day: the night before an 11 AM meeting, tomorrow's flights are the ones that matter.
function searchWindows(now: Date, goalTime: string): Array<[string, string]> {
  const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // YYYY-MM-DD
  const days = [...new Set([ymd(now), ymd(new Date(goalTime))])].filter((d) => d >= ymd(now)).slice(0, 2);
  return days.flatMap((day) => [[`${day}T00:00`, `${day}T11:59`], [`${day}T12:00`, `${day}T23:59`]] as Array<[string, string]>);
}

// "6:30", "6", "six thirty" -> minutes past midnight on a 12-hour clock (AM/PM deliberately ignored).
function clockMinutes12(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]) % 12, min = Number(m[2] ?? 0);
  return h * 60 + min;
}
function localMinutes12(iso: string): number {
  const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).split(":").map(Number);
  return (h % 12) * 60 + m;
}

// The plan for a trip, with the traveller's saved buffer and (when AWS is on) a traffic-aware drive from Amazon Location.
interface PlanArgs { goalTime: string; goalPlace: string; origin: string; pickupStop?: string; flight: { number: string; from: string; to: string; departure: string; arrival: string } }
async function buildPlan(args: PlanArgs) {
  const profile = await getProfile();
  const bufferMinutes = profile.preferences.bufferMinutes ?? DEFAULTS.bufferMinutes;
  const base = { ...args, timeZone: TZ, ...DEFAULTS, bufferMinutes };
  // Ask Amazon Location for the drive at the time the estimate says to leave (traffic-aware).
  const from = findPlace(profile, args.origin), stop = findPlace(profile, args.pickupStop), airport = findPlace(profile, args.flight.from);
  const estimate = planTrip(base);
  const drive = from && airport && (!args.pickupStop || stop) ? await driveTime(from, airport, stop, new Date(estimate.steps[0].at)) : null;
  const plan = drive ? planTrip({ ...base, driveMinutes: drive.minutes, pickupDetourMinutes: args.pickupStop ? PICKUP_WAIT_MINUTES : 0 }) : estimate;
  const driveMinutes = drive?.minutes ?? DEFAULTS.driveMinutes + (args.pickupStop ? DEFAULTS.pickupDetourMinutes : 0);
  return { plan, drive, driveMinutes, bufferMinutes };
}

// What changed between two live readings of one flight, as a spoken alert. Delays under 10 minutes are noise.
const depOf = (f: FlightStatus) => (f.from.revisedLocal ?? f.from.scheduledLocal ?? "").replace(" ", "T");
const arrOf = (f: FlightStatus) => (f.to.revisedLocal ?? f.to.scheduledLocal ?? "").replace(" ", "T");
function flightChange(was: FlightStatus, now_: FlightStatus, a: { goalTime?: string; goalPlace?: string; flightNumber?: string }) {
  const n = now_.number || a.flightNumber || "Your flight";
  const where = a.goalPlace ?? "your meeting";
  if (/cancel/i.test(now_.status) && !/cancel/i.test(was.status)) {
    return { subject: `${n} is cancelled`, text: `${n} has been cancelled. Want flights that still get you to ${where} on time?`, data: { change: "cancelled", flightNumber: n } };
  }
  const shift = Math.round((new Date(depOf(now_)).getTime() - new Date(depOf(was)).getTime()) / 60_000);
  if (Math.abs(shift) >= 10 && depOf(now_)) {
    const newDep = fmtTime(depOf(now_), TZ);
    let tail = "", makesGoal: boolean | undefined, marginMinutes: number | undefined;
    if (a.goalTime && arrOf(now_)) {
      const c = checkFlightAgainstGoal({ number: n, from: now_.from.iata ?? "", to: now_.to.iata ?? "", departure: depOf(now_), arrival: arrOf(now_) }, a.goalTime, TZ, DEFAULTS.deplaneMinutes, DEFAULTS.arrivalToVenueMinutes, now());
      makesGoal = c.makesGoal; marginMinutes = c.marginMinutes;
      tail = c.makesGoal ? ` You'd still reach ${where} ${c.marginMinutes} minutes early.` : ` That gets you to ${where} ${-c.marginMinutes} minutes late. Want flights that still make it?`;
    }
    const verb = shift > 0 ? `is delayed ${shift} minutes` : `now leaves ${-shift} minutes early`;
    const text = `Heads up: ${n} ${verb}, leaving at ${newDep}.${tail}${shift > 0 && makesGoal !== false ? " Check-in can still close on the original schedule, so keep to your plan." : ""}`;
    return { subject: `${n} ${verb}: now ${newDep}`, text, data: { change: "delay", flightNumber: n, shiftMinutes: shift, newDepartureDisplay: newDep, oldDepartureDisplay: fmtTime(depOf(was), TZ), makesGoal, marginMinutes, gate: now_.from.gate } };
  }
  if (now_.from.gate && was.from.gate && now_.from.gate !== was.from.gate) {
    return { subject: `${n} gate change: ${now_.from.gate}`, text: `Gate change: ${n} now leaves from gate ${now_.from.gate}, not ${was.from.gate}.`, data: { change: "gate", flightNumber: n, gate: now_.from.gate, oldGate: was.from.gate } };
  }
  return null;
}

// Ride app handoff link (Uber universal link: opens the app if installed, else the website). Pickup and drop-off are
// prefilled with coordinates when GateCue knows the place. UBER_CLIENT_ID (from a free Uber developer app) is added when set.
function rideLink(from: { lat: number; lon: number; label: string } | undefined, fromText: string, to: { lat: number; lon: number; label: string } | undefined, toText: string): string {
  const u = new URL("https://m.uber.com/ul/");
  if (process.env.UBER_CLIENT_ID) u.searchParams.set("client_id", process.env.UBER_CLIENT_ID);
  u.searchParams.set("action", "setPickup");
  const put = (k: "pickup" | "dropoff", p: typeof from, text: string) => {
    if (p) { u.searchParams.set(`${k}[latitude]`, String(p.lat)); u.searchParams.set(`${k}[longitude]`, String(p.lon)); }
    u.searchParams.set(`${k}[nickname]`, p?.label ?? text);
  };
  put("pickup", from, fromText); put("dropoff", to, toText);
  return u.toString();
}

// Booking confirmations go to the traveller's inbox too, when email is set up. Never blocks or fails a booking.
async function emailBooking(b: Parameters<typeof bookingEmail>[0]): Promise<string> {
  if (!emailEnabled()) return "";
  const r = await sendEmail(bookingEmail(b));
  return r.ok ? " I've emailed you the details." : "";
}

export function createGateCueServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: "gatecue", version: "0.2.0", title: "GateCue" },
    {
      capabilities: { logging: {}, tasks: { requests: { tools: { call: {} } } } },
      taskStore: deps.taskStore,
      taskMessageQueue: deps.taskMessageQueue,
      instructions:
        "GateCue gets a traveller from home to the gate in time for what actually matters. Plan backwards from the goal. Never invent times, prices or refund rules; use tool data. Always say AM or PM and the day. Before any flight payment, show review_flight first.",
    },
  );

  // MCP Apps CSP: cards load their illustrations and loops from this server's /assets, nothing else.
  const assetOrigin = new URL(deps.publicBaseUrl ?? "http://localhost:8787").origin;
  const uiMeta = { ui: { csp: { resourceDomains: [assetOrigin], connectDomains: [] as string[] }, prefersBorder: false } };
  for (const name of VIEW_NAMES) {
    const uri = viewUri(name);
    registerAppResource(server, `GateCue ${name} card`, uri, { description: `GateCue ${name} card`, _meta: uiMeta }, async () => ({
      contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: viewHtml(name, assetOrigin), _meta: uiMeta }],
    }));
  }

  // ---- plan_trip -------------------------------------------------------------------------
  registerAppTool(server, "plan_trip", {
    title: "Plan a travel day",
    description: "Plan a travel day backwards from the traveller's goal, such as an 11 AM meeting in another city: when to leave home, when check-in closes, and whether the flight gets them there in time. Returns a timeline.",
    inputSchema: {
      goalTime: z.string().describe("When the traveller must be at the goal, ISO 8601 with UTC offset"),
      goalPlace: z.string().describe("Name of the goal place, e.g. 'Market St office'"),
      origin: z.string().describe("Where the traveller leaves from"),
      pickupStop: z.string().optional().describe("Someone to pick up on the way"),
      flight: z.object(flightShape),
    },
    outputSchema: {
      summary: z.string(), feasible: z.boolean(), slackMinutes: z.number(), goalPlace: z.string(), goalDisplay: z.string(),
      flightNumber: z.string(), from: z.string(), to: z.string(), leaveWhen: z.string(),
      steps: z.array(z.object({ id: z.string(), label: z.string(), at: z.string(), display: z.string(), note: z.string().optional() })),
      driveMinutes: z.number(), driveSource: z.enum(["Amazon Location", "estimate"]), bufferMinutes: z.number(),
    },
    _meta: { ui: { resourceUri: viewUri("timeline") } },
  }, async (args) => {
    const outside = routeProblem(args.flight.from, args.flight.to);
    if (outside) return { isError: true, content: [{ type: "text", text: outside }] };
    const { plan, drive, driveMinutes, bufferMinutes } = await buildPlan(args);
    // Remember the trip, so the home screen, the watcher, emails and the next session all know about it.
    await saveTrip({ goalTime: args.goalTime, goalPlace: args.goalPlace, origin: args.origin, pickupStop: args.pickupStop, flight: args.flight, checkinCutoffMinutes: DEFAULTS.checkinCutoffMinutes });
    const driveTxt = drive ? ` The drive${args.pickupStop ? `, with the stop,` : ""} is about ${driveMinutes} minutes in traffic.` : "";
    return {
      content: [{ type: "text", text: plan.summary + driveTxt }],
      structuredContent: { ...plan, goalPlace: args.goalPlace, goalDisplay: fmtTime(args.goalTime, TZ), flightNumber: args.flight.number, from: args.flight.from, to: args.flight.to, leaveWhen: dayPart(plan.steps[0].at, TZ, now()), driveMinutes, driveSource: drive ? "Amazon Location" as const : "estimate" as const, bufferMinutes },
    };
  });

  // ---- traveller memory (DynamoDB) ------------------------------------------------------------
  server.registerTool("get_trip_context", {
    title: "Traveller's trips and preferences",
    description: "Get what GateCue remembers about the traveller: upcoming trips (flight, meeting time and place, who to pick up), home and saved places, and preferences like how early they like to be at check-in. Call this first when the traveller refers to their trip, meeting or flight without giving details.",
    inputSchema: {},
    outputSchema: {
      traveller: z.string(), home: z.string(), places: z.array(z.string()),
      preferences: z.object({ bufferMinutes: z.number(), notes: z.array(z.string()) }),
      trips: z.array(z.object({
        id: z.string(), goalTime: z.string(), goalDisplay: z.string(), goalDay: z.string(), goalPlace: z.string(), origin: z.string(), pickupStop: z.string().optional(),
        flight: z.object(flightShape), departureDisplay: z.string(), checkinCloses: z.string(), checkinClosesDisplay: z.string(),
      })),
      memory: z.enum(["DynamoDB", "in-memory"]),
    },
    annotations: { readOnlyHint: true },
  }, async () => {
    const [profile, trips] = await Promise.all([getProfile(), getTrips()]);
    const t = now();
    const upcoming = trips.filter((x) => new Date(x.goalTime) > t).sort((a, b) => a.goalTime.localeCompare(b.goalTime));
    const out = upcoming.map((x) => {
      const closes = new Date(new Date(x.flight.departure).getTime() - x.checkinCutoffMinutes * 60_000);
      return {
        id: x.id, goalTime: x.goalTime, goalDisplay: fmtTime(x.goalTime, TZ), goalDay: fmtDay(x.goalTime, TZ), goalPlace: x.goalPlace, origin: x.origin, pickupStop: x.pickupStop,
        flight: x.flight, departureDisplay: fmtTime(x.flight.departure, TZ), checkinCloses: closes.toISOString(), checkinClosesDisplay: fmtTime(closes, TZ),
      };
    });
    const next = out[0];
    const text = next
      ? `Next trip: ${next.flight.number} from ${next.flight.from} to ${next.flight.to} at ${next.departureDisplay} ${dayPart(next.flight.departure, TZ, t)}, for ${next.goalPlace} at ${next.goalDisplay}. Likes to be at check-in ${profile.preferences.bufferMinutes} minutes before it closes.`
      : "No upcoming trips saved.";
    return {
      content: [{ type: "text", text }],
      structuredContent: { traveller: profile.name, home: profile.home.label, places: profile.places.map((p) => p.label), preferences: profile.preferences, trips: out, memory: memorySource() },
    };
  });

  server.registerTool("update_preferences", {
    title: "Remember a preference",
    description: "Save a lasting travel preference so GateCue uses it on every future trip, e.g. 'I like 20 minutes of buffer before check-in closes'. Only call when the traveller states a preference, not for a one-off change.",
    inputSchema: {
      bufferMinutes: z.number().int().min(0).max(120).optional().describe("How many minutes before check-in closes the traveller wants to be at the counter"),
      note: z.string().max(200).optional().describe("Any other short preference to remember, in the traveller's words"),
    },
    outputSchema: { preferences: z.object({ bufferMinutes: z.number(), notes: z.array(z.string()) }), memory: z.enum(["DynamoDB", "in-memory"]) },
  }, async ({ bufferMinutes, note }) => {
    if (bufferMinutes === undefined && !note) return { isError: true, content: [{ type: "text", text: "What should I remember?" }] };
    const prefs = await updatePreferences({ bufferMinutes, note });
    const text = bufferMinutes !== undefined ? `Got it. From now on I'll get you to check-in ${prefs.bufferMinutes} minutes before it closes.` : "Got it, I'll remember that.";
    return { content: [{ type: "text", text }], structuredContent: { preferences: prefs, memory: memorySource() } };
  });

  // ---- email_trip_plan (Amazon SES) -----------------------------------------------------------
  server.registerTool("email_trip_plan", {
    title: "Email the travel-day plan",
    description: "Email the traveller their plan for the next trip: when to leave, when check-in closes, the flight, and when they reach the meeting. Use when they ask to send, email or share the plan.",
    inputSchema: {},
    outputSchema: { sent: z.boolean(), to: z.string().optional(), subject: z.string().optional(), reason: z.string().optional() },
  }, async () => {
    const to = travellerEmail();
    if (!emailEnabled() || !to) return { isError: true, content: [{ type: "text", text: "Email isn't set up yet, so I can't send your plan." }], structuredContent: { sent: false, reason: "not-configured" } };
    const t = now();
    const trip = (await getTrips()).filter((x) => new Date(x.goalTime) > t).sort((a, b) => a.goalTime.localeCompare(b.goalTime))[0];
    if (!trip) return { isError: true, content: [{ type: "text", text: "I don't have an upcoming trip to send." }], structuredContent: { sent: false, reason: "no-trip" } };
    const { plan, drive, driveMinutes, bufferMinutes } = await buildPlan(trip);
    const mail = planEmail({ ...plan, goalPlace: trip.goalPlace, goalTime: trip.goalTime, flightNumber: trip.flight.number, from: trip.flight.from, to: trip.flight.to, driveMinutes, driveSource: drive ? "Amazon Location" : "estimate", bufferMinutes, pickupStop: trip.pickupStop });
    const r = await sendEmail(mail);
    if (!r.ok) {
      const text = r.reason === "not-verified" ? "I can't email you until your address is confirmed. Look for a message from Amazon Web Services and tap its link." : "The email didn't go through. Want me to try again?";
      return { isError: true, content: [{ type: "text", text }], structuredContent: { sent: false, to: maskEmail(to), reason: r.reason } };
    }
    return { content: [{ type: "text", text: `Sent. Your plan is in your inbox: leave at ${spokenTime(plan.steps[0].at, TZ)} ${dayPart(plan.steps[0].at, TZ, t)}.` }], structuredContent: { sent: true, to: maskEmail(to), subject: mail.subject } };
  });

  // ---- search_flights ----------------------------------------------------------------------
  registerAppTool(server, "search_flights", {
    title: "Find flights that still make the goal",
    description: `Find the remaining flights between two airports (today and the goal's day), marking which ones still get the traveller to their goal on time. Use for a new trip, or when a flight is missed or cancelled, or the traveller asks for other flights. Returns up to 5 options, best first. Covers West Coast airports: ${COVERAGE}.`,
    inputSchema: {
      from: z.string().describe("Departure airport IATA code"),
      to: z.string().describe("Arrival airport IATA code"),
      goalTime: z.string().describe("When the traveller must be at the goal, ISO 8601 with UTC offset"),
      goalPlace: z.string().describe("Name of the goal place"),
      departsAround: z.string().optional().describe("A clock time the traveller mentioned, like '6:30' or '6'. Flights leaving within 30 minutes of it, morning or evening, are listed first so the traveller can see which one they mean."),
    },
    outputSchema: { headline: z.string(), goalDisplay: z.string(), options: z.array(optionShape), hiddenCount: z.number() },
    _meta: { ui: { resourceUri: viewUri("flights") } },
  }, async ({ from, to, goalTime, goalPlace, departsAround }) => {
    from = from.trim().toUpperCase(); to = to.trim().toUpperCase();
    const outside = routeProblem(from, to);
    if (outside) return { isError: true, content: [{ type: "text", text: outside }] };
    if (!aeroEnabled()) return { isError: true, content: [{ type: "text", text: "I can't search flights right now. Try again in a moment." }] };
    const t = now();
    let all: FlightOption[];
    try {
      all = await searchFlights({ from, to, windows: searchWindows(t, goalTime), goalTime, timeZone: TZ, now: t, deplaneMinutes: DEFAULTS.deplaneMinutes, arrivalToVenueMinutes: DEFAULTS.arrivalToVenueMinutes });
    } catch {
      return { isError: true, content: [{ type: "text", text: "The flight schedule service didn't answer. Want me to try again?" }] };
    }
    if (!all.length) return { isError: true, content: [{ type: "text", text: `I couldn't find any more flights from ${from} to ${to} before your meeting. Want me to look at later flights?` }] };
    const makers = all.filter((o) => o.check.makesGoal);
    // Up to 5 inline (Alexa+ carousel guidance). If the traveller named a clock time, flights near it
    // (AM or PM) go first so the ambiguity is visible; otherwise flights that make it, then the next few that don't.
    const target = departsAround ? clockMinutes12(departsAround) : null;
    const near = target === null ? [] : all.filter((o) => Math.abs(localMinutes12(o.flight.departure) - target) <= 30);
    const shown = [...near, ...makers, ...all.filter((o) => !o.check.makesGoal)].filter((o, i, a) => a.findIndex((x) => x.id === o.id) === i).slice(0, 5);
    for (const o of shown) options.set(o.id, { ...o, goalTime, goalPlace });
    const hiddenCount = all.length - shown.length;
    const headline = makers.length ? `${makers.length} ${makers.length === 1 ? "flight still gets" : "flights still get"} you there` : "No flight today gets you there in time";
    const nearTxt = near.length
      ? `The ${departsAround} o'clock flight is ${near[0].flight.number} at ${near[0].check.departureDisplay} ${near[0].check.departureDaySpoken}${near[0].check.makesGoal ? ", and it makes your meeting." : ", and it lands after your meeting."} `
      : "";
    const best = makers[0];
    const spoken = nearTxt + (best
      ? `${headline}. The best is ${best.flight.number} at ${best.check.departureDisplay} ${best.check.departureDaySpoken}, with ${best.check.marginMinutes} minutes to spare.`
      : `${headline}. The earliest is ${all[0].flight.number} at ${all[0].check.departureDisplay} ${all[0].check.departureDaySpoken}.`);
    return { content: [{ type: "text", text: spoken }], structuredContent: { headline, goalDisplay: fmtTime(goalTime, TZ), options: shown, hiddenCount } };
  });

  // ---- review_flight: the panic-proof check, no payment -------------------------------------
  registerAppTool(server, "review_flight", {
    title: "Review a flight before paying",
    description: "Show the traveller one flight before paying: departure day with AM or PM, how far away it is, whether it still makes the goal, and the refund rule. Always call this before book_flight. Takes an option id from search_flights.",
    inputSchema: { optionId: z.string().describe("Option id from search_flights") },
    outputSchema: {
      quoteId: z.string(), airline: z.string(), flight: z.object(flightShape), check: checkShape,
      goalDisplay: z.string(), goalPlace: z.string(), atVenueDisplay: z.string(), fareUsd: z.number(), refundable: z.boolean(),
    },
    _meta: { ui: { resourceUri: viewUri("review") } },
  }, async ({ optionId }) => {
    const o = options.get(optionId);
    if (!o) return { isError: true, content: [{ type: "text", text: "That flight option has expired. Let me search again." }] };
    const quoteId = `q_${randomUUID().slice(0, 8)}`;
    quotes.set(quoteId, { id: quoteId, option: o, goalTime: o.goalTime, goalPlace: o.goalPlace, createdAt: Date.now() });
    const atVenue = new Date(new Date(o.flight.arrival).getTime() + (DEFAULTS.deplaneMinutes + DEFAULTS.arrivalToVenueMinutes) * 60_000);
    const c = o.check;
    const refund = o.refundable ? "It's refundable." : "It's non-refundable.";
    const spoken = c.makesGoal
      ? `${o.flight.number} leaves at ${c.departureDisplay} ${c.departureDaySpoken}, ${c.departsIn}, and gets you there ${c.marginMinutes} minutes early. It's $${o.fareUsd}. ${refund} Should I book it?`
      : `Careful. ${o.flight.number} leaves at ${c.departureDisplay} ${c.departureDaySpoken}, and lands after your ${spokenTime(o.goalTime, TZ)} meeting. ${refund} Want flights that make your meeting instead?`;
    return {
      content: [{ type: "text", text: spoken }],
      structuredContent: { quoteId, airline: o.airline, flight: o.flight, check: c, goalDisplay: fmtTime(o.goalTime, TZ), goalPlace: o.goalPlace, atVenueDisplay: fmtTime(atVenue, TZ), fareUsd: o.fareUsd, refundable: o.refundable },
    };
  });

  // ---- book_flight: explicit acknowledgement if it misses the goal, then secure checkout ------
  registerAppTool(server, "book_flight", {
    title: "Book and pay for a reviewed flight",
    description: "Book a flight the traveller has reviewed with review_flight and pay through a secure checkout page. If the flight misses the goal, the traveller must explicitly confirm they accept that.",
    inputSchema: { quoteId: z.string().describe("Quote id from review_flight") },
    outputSchema: {
      kind: z.literal("flight"), status: z.enum(["booked", "cancelled", "not_paid"]), confirmation: z.string().optional(), flightNumber: z.string(),
      from: z.string(), to: z.string(), departureDisplay: z.string(), arrivalDisplay: z.string(), departureDay: z.string(), fareUsd: z.number(),
    },
    _meta: { ui: { resourceUri: viewUri("confirm") } },
  }, async ({ quoteId }, extra) => {
    const q = quotes.get(quoteId);
    if (!q) return { isError: true, content: [{ type: "text", text: "I need to show you the flight again before booking. Want me to?" }] };
    const o = q.option;
    const base = { kind: "flight" as const, flightNumber: o.flight.number, from: o.flight.from, to: o.flight.to, departureDisplay: o.check.departureDisplay, arrivalDisplay: o.check.arrivalDisplay, departureDay: o.check.departureDay, fareUsd: o.fareUsd };

    if (!o.check.makesGoal) {
      const ack = await server.server.elicitInput({
        mode: "form",
        message: `${o.flight.number} leaves at ${o.check.departureDisplay} ${o.check.departureDaySpoken} and lands at ${o.check.arrivalDisplay}, after your meeting at ${spokenTime(q.goalTime, TZ)}. Book it anyway?`,
        requestedSchema: {
          type: "object",
          properties: { acceptMiss: { type: "boolean", title: `Yes, I'll miss my ${spokenTime(q.goalTime, TZ)} meeting`, default: false } },
          required: ["acceptMiss"],
        },
      });
      if (ack.action !== "accept" || ack.content?.acceptMiss !== true) {
        return { content: [{ type: "text", text: "Okay, I didn't book it. Want flights that make your meeting?" }], structuredContent: { status: "cancelled", ...base } };
      }
    }

    const elicitationId = randomUUID();
    const checkout = await startCheckout({
      baseUrl: deps.publicBaseUrl, elicitationId, amountUsd: o.fareUsd, timeoutMs: 10 * 60_000,
      label: `GateCue: ${o.flight.number} ${o.flight.from} to ${o.flight.to}, departs ${o.check.departureDisplay} ${o.check.departureDay}`,
    });
    void extra;
    const open = await server.server.elicitInput({ mode: "url", message: `Pay $${o.fareUsd} for ${o.flight.number} on the secure checkout page.`, url: checkout.url, elicitationId });
    if (open.action !== "accept") return { content: [{ type: "text", text: "No problem, nothing was charged." }], structuredContent: { status: "not_paid", ...base } };
    const paid = await checkout.done;
    await server.server.createElicitationCompletionNotifier(elicitationId)();
    if (!paid.paid) return { content: [{ type: "text", text: "The payment didn't go through, so nothing was booked." }], structuredContent: { status: "not_paid", ...base } };
    quotes.delete(quoteId);
    const confirmation = `GC${randomUUID().slice(0, 6).toUpperCase()}`;
    await updateTripFlight(q.goalTime, o.flight); // the trip now remembers the new flight
    const mailed = await emailBooking({ kind: "flight", flightNumber: o.flight.number, from: o.flight.from, to: o.flight.to, departure: o.flight.departure, arrival: o.flight.arrival, fareUsd: o.fareUsd, confirmation, refundable: o.refundable });
    return { content: [{ type: "text", text: `You're booked on ${o.flight.number}, leaving ${o.check.departureDisplay} ${o.check.departureDaySpoken}. Confirmation ${confirmation.split("").join(" ")}.${mailed}` }], structuredContent: { status: "booked", confirmation, ...base } };
  });

  // ---- book_ride: hand the ride to the traveller's ride app, prefilled ------------------------
  // Ride companies don't let third parties book on a rider's behalf (their booking APIs are partner-only), so GateCue
  // does the honest thing: it opens the ride app with pickup and airport filled in, and the traveller requests and pays
  // there. GateCue never sees payment details and never books a ride by itself.
  registerAppTool(server, "book_ride", {
    title: "Set up the ride to the airport",
    description: "Open the traveller's ride app with the pickup and the airport already filled in, for the leave time from plan_trip. The traveller requests (or schedules) and pays in the ride app. Mention a pickup stop so they can add it there.",
    inputSchema: { pickup: z.string().describe("Where the ride starts, usually home"), stop: z.string().optional().describe("A pickup stop on the way, if the plan has one"), dropoff: z.string().describe("The departure airport (the ride goes to the airport, not to the meeting)"), pickupTime: z.string().describe("ISO 8601 with UTC offset: the leave time from plan_trip") },
    outputSchema: {
      kind: z.literal("ride"), status: z.enum(["handed_off", "cancelled"]), pickupDisplay: z.string(), pickupDay: z.string(),
      pickup: z.string(), stop: z.string().optional(), dropoff: z.string(), link: z.string().optional(), scheduleAhead: z.boolean(),
    },
    _meta: { ui: { resourceUri: viewUri("confirm") } },
  }, async (args) => {
    const pickupDisplay = fmtTime(args.pickupTime, TZ);
    const pickupDay = fmtDay(args.pickupTime, TZ);
    // More than 30 minutes away: the traveller schedules it in the app rather than requesting now.
    const scheduleAhead = new Date(args.pickupTime).getTime() - now().getTime() > 30 * 60_000;
    const profile = await getProfile();
    // This ride always goes to the departure airport of the upcoming trip. A model that fills in the meeting
    // place (in another city) would send the car to the wrong place, so anything else is corrected here.
    const trips = await getTrips();
    const trip = trips.find((t) => new Date(t.goalTime).getTime() > now().getTime()) ?? trips[0];
    const airport = trip ? findPlace(profile, trip.flight.from) : undefined;
    const asked = findPlace(profile, args.dropoff);
    const dropoff = airport && asked !== airport ? airport.label : args.dropoff;
    if (dropoff !== args.dropoff) console.info(`[book_ride] dropoff "${args.dropoff}" corrected to the departure airport`);
    const where = { kind: "ride" as const, pickupDay, pickup: args.pickup, stop: args.stop, dropoff, scheduleAhead };
    const link = rideLink(findPlace(profile, args.pickup), args.pickup, findPlace(profile, dropoff), dropoff);
    const how = `${scheduleAhead ? `Schedule it for ${spokenTime(args.pickupTime, TZ)} ${dayPart(args.pickupTime, TZ, now())}` : "Request it now"}${args.stop ? ` and add ${args.stop} as a stop` : ""}.`;
    const open = await server.server.elicitInput({
      mode: "url", url: link, elicitationId: randomUUID(),
      message: `Open your ride app with ${args.pickup} to ${dropoff} filled in? ${how} You'll see the price and pay in the app.`,
    });
    if (open.action !== "accept") return { content: [{ type: "text", text: "Okay, I didn't open your ride app." }], structuredContent: { status: "cancelled", pickupDisplay, ...where } };
    return {
      content: [{ type: "text", text: `Your ride app is open with the airport filled in. ${how}` }],
      structuredContent: { status: "handed_off", pickupDisplay, link, ...where },
    };
  });

  // ---- get_flight_status -------------------------------------------------------------------
  server.registerTool("get_flight_status", {
    title: "Flight status",
    description: "Get the live status of one flight: scheduled and revised times, terminal, gate, delays or cancellation.",
    inputSchema: { number: z.string().describe("Flight number, e.g. CQ 725"), date: z.string().describe("Departure date in the departure airport's local time, YYYY-MM-DD") },
    outputSchema: {
      flights: z.array(z.object({
        number: z.string(), status: z.string(), airline: z.string().optional(),
        from: z.object({ iata: z.string().optional(), name: z.string().optional(), scheduledLocal: z.string().optional(), revisedLocal: z.string().optional(), terminal: z.string().optional(), gate: z.string().optional() }),
        to: z.object({ iata: z.string().optional(), name: z.string().optional(), scheduledLocal: z.string().optional(), revisedLocal: z.string().optional(), terminal: z.string().optional() }),
        source: z.enum(["AeroDataBox", "demo schedule"]),
      })),
    },
  }, async ({ number, date }) => {
    if (!aeroEnabled()) return { isError: true, content: [{ type: "text", text: "I can't check live flight status right now. Try again in a moment." }] };
    try {
      const flights = await getFlightStatus(number, date);
      if (!flights.length) return { isError: true, content: [{ type: "text", text: `I couldn't find ${number} on ${date}. Can you check the flight number?` }] };
      const f = flights[0];
      const dep = f.from.revisedLocal ?? f.from.scheduledLocal ?? "";
      const depTxt = dep ? `${fmtTime(dep.replace(" ", "T"), TZ)}` : "unknown";
      return { content: [{ type: "text", text: `${f.number} from ${f.from.iata ?? ""} to ${f.to.iata ?? ""} is ${f.status.toLowerCase()}, departing ${depTxt}${f.from.terminal ? ` from terminal ${f.from.terminal}` : ""}${f.from.gate ? `, gate ${f.from.gate}` : ""}.` }], structuredContent: { flights } };
    } catch {
      return { isError: true, content: [{ type: "text", text: "The flight status service didn't answer. Want me to try again?" }] };
    }
  });

  // ---- watch_trip (Task) -----------------------------------------------------------------------
  server.experimental.tasks.registerToolTask("watch_trip", {
    title: "Watch the trip",
    description: "Watch the trip in the background and speak up first: when it's time to move for check-in, and (if a flight is given) when that flight is delayed, changes gate or is cancelled.",
    inputSchema: {
      checkinCloses: z.string().describe("When check-in closes, ISO 8601 with UTC offset"),
      walkMinutes: z.number().describe("Walk time to the check-in counter"),
      nudgeLeadMinutes: z.number().default(15).describe("Speak up this many minutes before the latest time to leave"),
      flightNumber: z.string().optional().describe("Also watch this flight's live status, e.g. CQ 725"),
      flightDate: z.string().optional().describe("The flight's departure date, local YYYY-MM-DD"),
      goalTime: z.string().optional().describe("The goal time (ISO 8601), to say whether a delayed flight still makes it"),
      goalPlace: z.string().optional().describe("The goal place, for the spoken alert"),
    },
    execution: { taskSupport: "required" },
    _meta: { ui: { resourceUri: viewUri("countdown") } },
  }, {
    async createTask(args, { taskStore, taskRequestedTtl }) {
      const task = await taskStore.createTask({ ttl: taskRequestedTtl ?? 60 * 60_000, pollInterval: 500 });
      const closes = new Date(args.checkinCloses);
      const latestLeave = new Date(closes.getTime() - args.walkMinutes * 60_000);
      const tick = Math.max(50, 1000 / speedup());
      const watchFlight = !!(args.flightNumber && args.flightDate && aeroEnabled());
      const pollEvery = demoScheduleOn() ? 0 : 5 * 60_000; // live data: every 5 minutes (the status cache's age)
      let baseline: FlightStatus | undefined, lastPoll = 0;
      (async () => {
        try {
          for (;;) {
            // Stop quietly if the host cancelled the task or it expired (e.g. the device went away).
            const cur = await taskStore.getTask(task.taskId).catch(() => null);
            if (!cur || ["completed", "failed", "cancelled"].includes(cur.status)) return;
            const t = now();
            if (watchFlight && Date.now() - lastPoll >= pollEvery) {
              lastPoll = Date.now();
              const f = (await getFlightStatus(args.flightNumber!, args.flightDate!).catch(() => []))[0];
              if (f && !baseline) baseline = f;
              const alert = f && baseline ? flightChange(baseline, f, args) : null;
              if (alert) {
                const mailed = emailEnabled() ? (await sendEmail(alertEmail(alert.subject, alert.text))).ok : false;
                await taskStore.storeTaskResult(task.taskId, "completed", {
                  content: [{ type: "text", text: alert.text + (mailed ? " I've emailed you too." : "") }],
                  structuredContent: { ...alert.data, kind: "change", closesDisplay: fmtTime(closes, TZ), closesAt: closes.toISOString(), serverNow: now().toISOString(), speedup: speedup(), walkMinutes: args.walkMinutes },
                });
                return;
              }
            }
            const minsToLatest = Math.round((latestLeave.getTime() - t.getTime()) / 60_000);
            const minsToClose = Math.ceil((closes.getTime() - t.getTime()) / 60_000);
            if (minsToLatest <= (args.nudgeLeadMinutes ?? 15)) {
              const spare = Math.max(0, minsToClose - args.walkMinutes);
              await taskStore.storeTaskResult(task.taskId, "completed", {
                content: [{ type: "text", text: `Check-in closes in ${minsToClose} minute${minsToClose === 1 ? "" : "s"} and it's a ${args.walkMinutes}-minute walk. Leave now and you'll have ${spare} minute${spare === 1 ? "" : "s"} spare.` }],
                structuredContent: { kind: "nudge", minsToClose, walkMinutes: args.walkMinutes, spareMinutes: spare, closesDisplay: fmtTime(closes, TZ), closesAt: closes.toISOString(), serverNow: now().toISOString(), speedup: speedup() },
              });
              return;
            }
            await taskStore.updateTaskStatus(task.taskId, "working", `Watching. Check-in closes at ${fmtTime(closes, TZ)}, in ${minsToClose} minutes.`);
            await new Promise((r) => setTimeout(r, tick));
          }
        } catch (err) {
          console.warn(`[watch_trip] ${task.taskId}: ${(err as Error)?.message ?? err}`);
          // Never let a background watcher take the server down.
          await taskStore.storeTaskResult(task.taskId, "failed", { content: [{ type: "text", text: "I stopped watching your trip because something went wrong." }], isError: true }).catch(() => {});
        }
      })();
      return { task };
    },
    async getTask(_a, { taskId, taskStore }) { return await taskStore.getTask(taskId); },
    async getTaskResult(_a, { taskId, taskStore }) { return (await taskStore.getTaskResult(taskId)) as any; },
  });

  return server;
}
