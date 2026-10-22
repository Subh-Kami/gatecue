// Flight search on real AeroDataBox schedules, checked against the traveller's goal.
// Fares and refund rules are SIMULATED (no public fare API); results say so in `fareSource`.
import { createHash } from "node:crypto";
import { aeroGet } from "./aerodatabox.js";
import { demoFare } from "./demo-schedule.js";
import { checkFlightAgainstGoal, type FlightRef, type FlightCheck } from "./plan.js";

export interface FlightOption {
  id: string;
  flight: FlightRef;
  airline: string;
  status: string;
  check: FlightCheck;
  fareUsd: number;
  refundable: boolean;
  fareSource: "simulated";
  durationMinutes: number;
}

const toIso = (local: string) => {
  // AeroDataBox local format: "2026-10-15 06:39-07:00" -> ISO "2026-10-15T06:39:00-07:00"
  const m = local.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})([+-]\d{2}:\d{2})$/);
  return m ? `${m[1]}T${m[2]}:00${m[3]}` : local;
};

function simulatedFare(number: string, depIso: string): { fareUsd: number; refundable: boolean } {
  const h = createHash("sha1").update(number + depIso).digest();
  const fareUsd = 129 + (h[0] % 140); // $129-$268, stable per flight
  const refundable = h[1] % 3 === 0; // about 1 in 3 fares refundable
  return { fareUsd, refundable };
}

export async function searchFlights(p: {
  from: string; to: string; windows: Array<[string, string]>; // local "YYYY-MM-DDTHH:mm" pairs, each <= 12h
  goalTime: string; timeZone: string; now: Date; deplaneMinutes: number; arrivalToVenueMinutes: number;
}): Promise<FlightOption[]> {
  const out: FlightOption[] = [];
  for (const [a, b] of p.windows) {
    const path = `/flights/airports/iata/${p.from}/${a}/${b}?withLeg=true&direction=Departure&withCancelled=true&withCodeshared=false&withCargo=false&withPrivate=false&withLocation=false`;
    const body = await aeroGet(path, 30 * 60_000);
    for (const d of body?.departures ?? []) {
      if (d.arrival?.airport?.iata !== p.to) continue;
      const depLocal = d.departure?.revisedTime?.local ?? d.departure?.scheduledTime?.local;
      const arrLocal = d.arrival?.revisedTime?.local ?? d.arrival?.scheduledTime?.local;
      if (!depLocal || !arrLocal) continue;
      const flight: FlightRef = { number: d.number, from: p.from, to: p.to, departure: toIso(depLocal), arrival: toIso(arrLocal) };
      if (new Date(flight.departure).getTime() <= p.now.getTime()) continue; // already gone
      if (String(d.status).toLowerCase().startsWith("cancel")) continue;
      const check = checkFlightAgainstGoal(flight, p.goalTime, p.timeZone, p.deplaneMinutes, p.arrivalToVenueMinutes, p.now);
      const { fareUsd, refundable } = demoFare(flight.number) ?? simulatedFare(flight.number, flight.departure);
      out.push({
        id: `${flight.number.replace(/\s+/g, "")}_${flight.departure}`,
        flight, airline: d.airline?.name ?? "", status: d.status ?? "Expected", check, fareUsd, refundable, fareSource: "simulated",
        durationMinutes: Math.round((new Date(flight.arrival).getTime() - new Date(flight.departure).getTime()) / 60_000),
      });
    }
  }
  // Strongest first (Alexa+ carousel guidance): flights that make the goal, earliest departure first; then the rest.
  out.sort((x, y) => Number(y.check.makesGoal) - Number(x.check.makesGoal) || x.flight.departure.localeCompare(y.flight.departure));
  const seen = new Set<string>();
  return out.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)));
}
