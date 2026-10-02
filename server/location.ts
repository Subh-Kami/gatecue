// Drive times from Amazon Location Service (Routes API v2), with traffic at the planned departure time.
// Only used when AWS is on (GC_AWS=1). Returns null on any failure so callers fall back to estimates.
import { GeoRoutesClient, CalculateRoutesCommand, type CalculateRoutesCommandInput } from "@aws-sdk/client-geo-routes";
import type { Place } from "./memory.js";

let client: GeoRoutesClient | undefined;
const geo = () => (client ??= new GeoRoutesClient({ region: process.env.AWS_REGION ?? "us-east-1" }));
const cache = new Map<string, { minutes: number; legs: number[] }>();

export interface Drive { minutes: number; legs: number[]; source: "Amazon Location" }

export async function driveTime(from: Place, to: Place, via: Place | undefined, departAt: Date): Promise<Drive | null> {
  if (process.env.GC_AWS !== "1") return null;
  // Same trip, same 15-minute slot -> same answer (keeps the demo fast and the bill near zero).
  const slot = Math.floor(departAt.getTime() / (15 * 60_000));
  const key = [from, via, to].filter(Boolean).map((p) => `${p!.lon},${p!.lat}`).join(">") + `@${slot}`;
  const hit = cache.get(key);
  if (hit) return { ...hit, source: "Amazon Location" };

  const base: CalculateRoutesCommandInput = {
    Origin: [from.lon, from.lat],
    Destination: [to.lon, to.lat],
    ...(via ? { Waypoints: [{ Position: [via.lon, via.lat] }] } : {}),
    TravelMode: "Car",
    LegAdditionalFeatures: ["Summary"],
  };
  const future = departAt.getTime() > Date.now() + 60_000;
  for (const timing of future ? [{ DepartureTime: departAt.toISOString() }, { DepartNow: true }] : [{ DepartNow: true }]) {
    try {
      const r = await geo().send(new CalculateRoutesCommand({ ...base, ...timing }));
      const route = r.Routes?.[0];
      if (!route) continue;
      const legs = (route.Legs ?? []).map((l) => Math.round((l.VehicleLegDetails?.Summary?.Overview?.Duration ?? 0) / 60));
      const total = route.Summary?.Duration ?? (route.Legs ?? []).reduce((s, l) => s + (l.VehicleLegDetails?.Summary?.Overview?.Duration ?? 0), 0);
      if (!total) continue;
      const out = { minutes: Math.round(total / 60), legs };
      cache.set(key, out);
      return { ...out, source: "Amazon Location" };
    } catch (e) {
      console.warn(`[location] route failed (${"DepartureTime" in timing ? "timed" : "now"}): ${(e as Error).name}: ${(e as Error).message}`);
    }
  }
  return null;
}
