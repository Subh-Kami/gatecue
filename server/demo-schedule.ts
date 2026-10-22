// Built-in demo schedule, so GateCue runs end to end with no API keys (judges, CI, offline filming).
// Illustrative only: made-up airlines (Cascade Air, Bayline, Northstar Airways). Seattle (SEA) to San Francisco (SFO)
// is a hand-written list (the demo story); every other pair of covered West Coast airports gets a generated daily
// schedule, stable from day to day, with block times from the distance. Applied to whatever day is asked for. Used for filming and keyless runs; live
// schedules come from AeroDataBox (GATECUE_SCHEDULE=live with RAPIDAPI_KEY). Served in AeroDataBox's response shape,
// so the rest of GateCue can't tell the difference (and can't treat it differently).
import { createHash } from "node:crypto";
import { AIRPORTS, airport, miles } from "./airports.js";

const TZ = "America/Los_Angeles";
const SCHEDULE: Array<[string, string, string, string]> = [
  // [number, airline, departs (local HH:MM), arrives (local HH:MM)]
  ["CQ 725", "Cascade Air", "06:39", "08:49"],
  ["BL 499", "Bayline", "07:11", "09:30"],
  ["NS 1134", "Northstar Airways", "07:16", "09:38"],
  ["BL 2831", "Bayline", "09:05", "11:24"],
  ["CQ 528", "Cascade Air", "09:59", "12:26"],
  ["NS 1412", "Northstar Airways", "10:51", "13:08"],
  ["CQ 655", "Cascade Air", "11:54", "14:23"],
  ["BL 2281", "Bayline", "13:19", "15:35"],
  ["NS 3707", "Northstar Airways", "14:45", "17:05"],
  ["CQ 680", "Cascade Air", "15:44", "18:01"],
  ["BL 5841", "Bayline", "17:21", "19:51"],
  ["NS 3991", "Northstar Airways", "17:55", "20:18"],
  ["CQ 619", "Cascade Air", "19:36", "21:49"],
  ["NS 2635", "Northstar Airways", "21:35", "23:56"],
];

// GATECUE_SCHEDULE=demo forces it, =live forces AeroDataBox; otherwise demo only when there's no key and the clock is pinned.
// Story fares for the demo: the panic-booked evening flight is non-refundable, as it was in real life.
const STORY_FARES: Record<string, { fareUsd: number; refundable: boolean }> = { NS3991: { fareUsd: 140, refundable: false }, CQ725: { fareUsd: 266, refundable: false } };
export function demoFare(number: string): { fareUsd: number; refundable: boolean } | undefined {
  return demoScheduleOn() ? STORY_FARES[number.replace(/\s+/g, "").toUpperCase()] : undefined;
}

export function demoScheduleOn(): boolean {
  const mode = process.env.GATECUE_SCHEDULE;
  if (mode === "demo") return true;
  if (mode === "live") return false;
  return !process.env.RAPIDAPI_KEY && !!process.env.GATECUE_DEMO_NOW;
}

// "-07:00" for a given local date in Seattle.
function offsetOn(day: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "-08:00";
}
// Demo disruptions (set from the simulator for filming): a delay, a gate change or a cancellation on one flight.
export interface Disruption { delayMinutes?: number; gate?: string; cancelled?: boolean }
const disruptions = new Map<string, Disruption>();
const key = (n: string) => n.replace(/\s+/g, "").toUpperCase();
export function setDisruption(number: string, d: Disruption | null) { if (d) disruptions.set(key(number), d); else disruptions.delete(key(number)); }
export function clearDisruptions() { disruptions.clear(); }
// Base gates, stable per flight, so a gate change is visible.
const baseGate = (n: string) => `${"ABCD"[n.length % 4]}${(Number(n.replace(/\D/g, "")) % 14) + 1}`;

const addMin = (day: string, hhmm: string, mins: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + mins;
  const dd = new Date(`${day}T00:00:00Z`); dd.setUTCDate(dd.getUTCDate() + Math.floor(t / 1440));
  const d2 = dd.toISOString().slice(0, 10), r = ((t % 1440) + 1440) % 1440;
  return `${d2} ${String(Math.floor(r / 60)).padStart(2, "0")}:${String(r % 60).padStart(2, "0")}`;
};
const leg = (day: string, n: string, al: string, dep: string, arr: string, from = "SEA", to = "SFO") => {
  const off = offsetOn(day);
  const d = disruptions.get(key(n));
  const delay = d?.delayMinutes ?? 0;
  const [dh, dm] = dep.split(":").map(Number), [ah, am] = arr.split(":").map(Number);
  const arrDay = ah * 60 + am < dh * 60 + dm ? addMin(day, "00:00", 1440).slice(0, 10) : day; // lands after midnight
  return {
    number: n, status: d?.cancelled ? "Canceled" : delay >= 15 ? "Delayed" : "Expected", airline: { name: al },
    departure: {
      airport: { iata: from, name: airport(from)?.name ?? from }, scheduledTime: { local: `${day} ${dep}${off}` }, terminal: "M", gate: d?.gate ?? baseGate(n),
      ...(delay ? { revisedTime: { local: `${addMin(day, dep, delay)}${off}` } } : {}),
    },
    arrival: {
      airport: { iata: to, name: airport(to)?.name ?? to }, scheduledTime: { local: `${arrDay} ${arr}${off}` },
      ...(delay ? { revisedTime: { local: `${addMin(arrDay, arr, delay)}${off}` } } : {}),
    },
  };
};

// Generated daily schedule for one covered route (not SEA to SFO, which is the story list above).
type Row = { n: string; al: string; dep: string; arr: string; from: string; to: string };
const AIRLINES: Array<[string, string]> = [["CQ", "Cascade Air"], ["BL", "Bayline"], ["NS", "Northstar Airways"]];
const STORY_NUMBERS = new Set(SCHEDULE.map(([n]) => key(n)));
const hhmm = (mins: number) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
// Built once for every covered pair, in a fixed order, so flight numbers are unique across the whole schedule.
let routes: Map<string, Row[]> | undefined;
function build(): Map<string, Row[]> {
  const used = new Set(STORY_NUMBERS);
  const out = new Map<string, Row[]>();
  for (const a of AIRPORTS) for (const b of AIRPORTS) {
    if (a === b) continue;
    const k = `${a.iata}-${b.iata}`;
    if (k === "SEA-SFO") { out.set(k, SCHEDULE.map(([n, al, dep, arr]) => ({ n, al, dep, arr, from: "SEA", to: "SFO" }))); continue; }
    const h = createHash("sha1").update(k).digest();
    const block = Math.round(miles(a, b) / 7 + 35); // minutes gate to gate
    const count = 7 + (h[0] % 4); // 7 to 10 departures a day
    const rows: Row[] = [];
    for (let i = 0; i < count; i++) {
      const start = 6 * 60 + Math.round((i * (15.5 * 60)) / count) + (h[(i + 1) % 20] % 35); // 6:00 AM to about 9:30 PM
      const [code, name] = AIRLINES[(h[(i + 5) % 20] + i) % 3];
      let num = 1000 + ((h[(i + 2) % 20] * 256 + h[(i + 3) % 20] + i * 97) % 8000);
      while (used.has(`${code}${num}`)) num = num >= 8999 ? 1000 : num + 1;
      used.add(`${code}${num}`);
      rows.push({ n: `${code} ${num}`, al: name, dep: hhmm(start), arr: hhmm(start + block), from: a.iata, to: b.iata });
    }
    out.set(k, rows);
  }
  return out;
}
export function routeSchedule(from: string, to: string): Row[] {
  const a = airport(from), b = airport(to);
  if (!a || !b || a === b) return [];
  return (routes ??= build()).get(`${a.iata}-${b.iata}`) ?? [];
}
const allRows = () => [...(routes ??= build()).values()].flat();

// Answers the two AeroDataBox paths GateCue uses. A departures window can run past midnight into the next day.
export function demoAeroGet(path: string): unknown {
  const dep = /^\/flights\/airports\/iata\/([A-Z]{3})\/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})\/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(path);
  if (dep) {
    const [, from, day, a, day2, b] = dep;
    const rows = AIRPORTS.flatMap((x) => routeSchedule(from, x.iata));
    const pick = (d: string, lo: string, hi: string) => rows.filter((r) => r.dep >= lo && r.dep <= hi).map((r) => leg(d, r.n, r.al, r.dep, r.arr, r.from, r.to));
    return { departures: day2 === day ? pick(day, a, b) : [...pick(day, a, "23:59"), ...pick(day2, "00:00", b)] };
  }
  const num = /^\/flights\/number\/([A-Z0-9]+)\/(\d{4}-\d{2}-\d{2})/.exec(path);
  if (num) {
    const r = allRows().find((x) => key(x.n) === num[1].toUpperCase());
    return r ? [leg(num[2], r.n, r.al, r.dep, r.arr, r.from, r.to)] : [];
  }
  return null;
}
