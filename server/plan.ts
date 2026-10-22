// Pure planning logic. No I/O, so it is easy to test.

export interface FlightRef {
  number: string;
  from: string; // IATA
  to: string; // IATA
  departure: string; // ISO 8601 with offset
  arrival: string; // ISO 8601 with offset
}

export interface PlanInput {
  goalTime: string; // ISO 8601 with offset, e.g. the meeting start
  goalPlace: string;
  origin: string;
  pickupStop?: string;
  flight: FlightRef;
  timeZone: string; // IANA zone used for display, e.g. America/Los_Angeles
  driveMinutes: number;
  pickupDetourMinutes: number;
  checkinCutoffMinutes: number; // airline policy: check-in / bag drop closes this long before departure
  walkToCheckinMinutes: number;
  bufferMinutes: number; // how early to be at check-in before it closes
  deplaneMinutes: number;
  arrivalToVenueMinutes: number;
}

export interface Step {
  id: string;
  label: string;
  at: string; // ISO
  display: string; // e.g. "5:10 AM"
  note?: string;
}

export interface Plan {
  steps: Step[]; // chronological
  feasible: boolean;
  slackMinutes: number; // time between reaching the venue and the goal
  summary: string;
}

const MIN = 60_000;

export function fmtTime(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(d);
}

export function fmtDay(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone }).format(d);
}

export function fmtDayLong(iso: string | Date, timeZone: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(d);
}

// Voice-friendly time: "11 AM" instead of "11:00 AM".
export function spokenTime(iso: string | Date, timeZone: string): string {
  return fmtTime(iso, timeZone).replace(":00 ", " ");
}

// "this morning", "this evening", "tomorrow morning", or a weekday. Removes AM/PM doubt out loud.
export function dayPart(iso: string | Date, timeZone: string, now: Date = new Date()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const ymd = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(x);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(d));
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const today = ymd(now), day = ymd(d);
  const tomorrow = ymd(new Date(now.getTime() + 24 * 3600_000));
  if (day === today) return part === "evening" ? "this evening" : `this ${part}`;
  if (day === tomorrow) return `tomorrow ${part}`;
  return `${fmtDayLong(d, timeZone)}`;
}

// Spoken durations: "45 minutes", "2 hours 14 minutes", never "234 minutes".
export function spokenMinutes(n: number): string {
  const a = Math.abs(Math.round(n));
  if (a < 90) return `${a} minute${a === 1 ? "" : "s"}`;
  const h = Math.floor(a / 60), m = a % 60;
  return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} minute${m === 1 ? "" : "s"}` : ""}`;
}

export function relative(from: Date, to: Date): string {
  const mins = Math.round((to.getTime() - from.getTime()) / MIN);
  const abs = Math.abs(mins);
  if (abs >= 24 * 60) { const d = Math.round(abs / 1440); const span = `${d} day${d === 1 ? "" : "s"}`; return mins >= 0 ? `in ${span}` : `${span} ago`; }
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const parts = [h ? `${h} hour${h === 1 ? "" : "s"}` : "", m ? `${m} minute${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  const span = parts.join(" ") || "now";
  if (span === "now") return "now";
  return mins >= 0 ? `in ${span}` : `${span} ago`;
}

export function planTrip(i: PlanInput): Plan {
  const dep = new Date(i.flight.departure);
  const arr = new Date(i.flight.arrival);
  const goal = new Date(i.goalTime);

  const checkinCloses = new Date(dep.getTime() - i.checkinCutoffMinutes * MIN);
  const beAtCheckin = new Date(checkinCloses.getTime() - i.bufferMinutes * MIN);
  const arriveAirport = new Date(beAtCheckin.getTime() - i.walkToCheckinMinutes * MIN);
  const leaveHome = new Date(arriveAirport.getTime() - (i.driveMinutes + (i.pickupStop ? i.pickupDetourMinutes : 0)) * MIN);
  const atVenue = new Date(arr.getTime() + (i.deplaneMinutes + i.arrivalToVenueMinutes) * MIN);
  const slackMinutes = Math.round((goal.getTime() - atVenue.getTime()) / MIN);

  const tz = i.timeZone;
  const s = (id: string, label: string, d: Date, note?: string): Step => ({ id, label, at: d.toISOString(), display: fmtTime(d, tz), note });

  const steps: Step[] = [
    s("leave", "Leave home", leaveHome, i.pickupStop ? `Ride with a stop at ${i.pickupStop}` : undefined),
    s("airport", `Arrive at ${i.flight.from}`, arriveAirport),
    s("checkin", "Be at check-in", beAtCheckin, `${i.bufferMinutes} min before it closes`),
    s("cutoff", "Check-in closes", checkinCloses, `${i.checkinCutoffMinutes} min before departure (airline policy)`),
    s("depart", `${i.flight.number} departs`, dep),
    s("land", `Land at ${i.flight.to}`, arr),
    s("venue", `At ${i.goalPlace}`, atVenue),
    s("goal", "Meeting starts", goal),
  ];

  const feasible = slackMinutes >= 0;
  const summary = feasible
    ? `Leave at ${fmtTime(leaveHome, tz)}. You reach ${i.goalPlace} ${spokenMinutes(slackMinutes)} before your meeting.`
    : `This flight gets you to ${i.goalPlace} ${spokenMinutes(-slackMinutes)} after your meeting starts.`;

  return { steps, feasible, slackMinutes, summary };
}

export interface FlightCheck {
  departureDisplay: string; // "6:30 PM"
  departureDay: string; // "Thu, Oct 15" (cards)
  departureDaySpoken: string; // "this evening", "tomorrow morning" (voice)
  departsIn: string; // "in 13 hours"
  arrivalDisplay: string;
  makesGoal: boolean;
  marginMinutes: number; // positive = early, negative = late
  warning?: string;
}

// The panic-proof check: explicit AM/PM, day, relative time, and a comparison against the goal.
export function checkFlightAgainstGoal(
  f: FlightRef,
  goalTime: string,
  timeZone: string,
  deplaneMinutes: number,
  arrivalToVenueMinutes: number,
  now: Date = new Date(),
): FlightCheck {
  const dep = new Date(f.departure);
  const arr = new Date(f.arrival);
  const atVenue = new Date(arr.getTime() + (deplaneMinutes + arrivalToVenueMinutes) * MIN);
  const marginMinutes = Math.round((new Date(goalTime).getTime() - atVenue.getTime()) / MIN);
  const makesGoal = marginMinutes >= 0;
  const check: FlightCheck = {
    departureDisplay: fmtTime(dep, timeZone),
    departureDay: fmtDay(dep, timeZone),
    departureDaySpoken: dayPart(dep, timeZone, now),
    departsIn: relative(now, dep),
    arrivalDisplay: fmtTime(arr, timeZone),
    makesGoal,
    marginMinutes,
  };
  if (!makesGoal) {
    check.warning = `This lands at ${check.arrivalDisplay}, after your meeting at ${spokenTime(goalTime, timeZone)}.`;
  }
  return check;
}
