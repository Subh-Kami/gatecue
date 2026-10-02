// Real flight data from AeroDataBox (via RapidAPI). Responses are cached on disk to save the
// free plan's monthly units, and the cache doubles as the demo "replay" source.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { demoScheduleOn, demoAeroGet } from "./demo-schedule.js";

const HOST = "aerodatabox.p.rapidapi.com";
const CACHE_DIR = new URL("../data/cache/", import.meta.url);

// Live data with RAPIDAPI_KEY; in demo mode without a key, a built-in illustrative schedule (demo-schedule.ts).
export function aeroEnabled(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY) || demoScheduleOn();
}

export async function aeroGet(path: string, maxAgeMs: number): Promise<any> {
  if (demoScheduleOn()) return demoAeroGet(path);
  mkdirSync(CACHE_DIR, { recursive: true });
  const file = new URL(createHash("sha1").update(path).digest("hex") + ".json", CACHE_DIR);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8"));
    if (process.env.GATECUE_REPLAY === "1" || Date.now() - cached.fetchedAt < maxAgeMs) return cached.body;
  }
  const r = await fetch(`https://${HOST}${path}`, { headers: { "X-RapidAPI-Key": process.env.RAPIDAPI_KEY ?? "", "X-RapidAPI-Host": HOST } });
  if (r.status === 204) return null;
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`AeroDataBox ${r.status}: ${body?.message ?? "request failed"}`);
  writeFileSync(file, JSON.stringify({ path, fetchedAt: Date.now(), body }, null, 1));
  return body;
}

export interface FlightStatus {
  number: string;
  status: string; // e.g. Expected, Delayed, Canceled, Departed
  airline?: string;
  from: { iata?: string; name?: string; scheduledLocal?: string; revisedLocal?: string; terminal?: string; gate?: string };
  to: { iata?: string; name?: string; scheduledLocal?: string; revisedLocal?: string; terminal?: string };
  source: "AeroDataBox" | "demo schedule";
}

// dateLocal = YYYY-MM-DD in the departure airport's time zone.
export async function getFlightStatus(number: string, dateLocal: string): Promise<FlightStatus[]> {
  const n = number.replace(/\s+/g, "");
  const list = (await aeroGet(`/flights/number/${encodeURIComponent(n)}/${dateLocal}?withAircraftImage=false&withLocation=false`, 5 * 60_000)) ?? [];
  return (Array.isArray(list) ? list : []).map((f: any) => ({
    number: f.number,
    status: f.status,
    airline: f.airline?.name,
    from: {
      iata: f.departure?.airport?.iata, name: f.departure?.airport?.name,
      scheduledLocal: f.departure?.scheduledTime?.local, revisedLocal: f.departure?.revisedTime?.local,
      terminal: f.departure?.terminal, gate: f.departure?.gate,
    },
    to: {
      iata: f.arrival?.airport?.iata, name: f.arrival?.airport?.name,
      scheduledLocal: f.arrival?.scheduledTime?.local, revisedLocal: f.arrival?.revisedTime?.local, terminal: f.arrival?.terminal,
    },
    source: demoScheduleOn() ? "demo schedule" : "AeroDataBox",
  }));
}
