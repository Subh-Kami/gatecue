// The airports GateCue covers today: West Coast airports that share Pacific time, so every time on a card,
// in speech and in email is right without per-airport time zones (the next step for international trips).
export interface Airport { iata: string; name: string; city: string; lat: number; lon: number }

export const AIRPORTS: Airport[] = [
  { iata: "SEA", name: "Seattle-Tacoma", city: "Seattle", lat: 47.4502, lon: -122.3088 },
  { iata: "PDX", name: "Portland", city: "Portland", lat: 45.5898, lon: -122.5951 },
  { iata: "GEG", name: "Spokane", city: "Spokane", lat: 47.6199, lon: -117.5338 },
  { iata: "SFO", name: "San Francisco", city: "San Francisco", lat: 37.6213, lon: -122.379 },
  { iata: "OAK", name: "Oakland", city: "Oakland", lat: 37.7126, lon: -122.2197 },
  { iata: "SJC", name: "San Jose", city: "San Jose", lat: 37.3639, lon: -121.9289 },
  { iata: "SMF", name: "Sacramento", city: "Sacramento", lat: 38.6954, lon: -121.5908 },
  { iata: "RNO", name: "Reno-Tahoe", city: "Reno", lat: 39.4991, lon: -119.7681 },
  { iata: "LAX", name: "Los Angeles", city: "Los Angeles", lat: 33.9416, lon: -118.4085 },
  { iata: "BUR", name: "Hollywood Burbank", city: "Burbank", lat: 34.2007, lon: -118.3587 },
  { iata: "SNA", name: "Orange County", city: "Orange County", lat: 33.6762, lon: -117.8675 },
  { iata: "SAN", name: "San Diego", city: "San Diego", lat: 32.7338, lon: -117.1933 },
  { iata: "PSP", name: "Palm Springs", city: "Palm Springs", lat: 33.8297, lon: -116.507 },
  { iata: "LAS", name: "Las Vegas", city: "Las Vegas", lat: 36.084, lon: -115.1537 },
];

export const airport = (code: string | undefined) => AIRPORTS.find((a) => a.iata === String(code ?? "").trim().toUpperCase());

export const COVERAGE = "Seattle, Portland, Spokane, the Bay Area, Sacramento, Reno, Los Angeles, Orange County, San Diego, Palm Springs and Las Vegas";

// null when GateCue can handle the route; otherwise the sentence Alexa says instead.
export function routeProblem(from: string, to: string): string | null {
  const a = airport(from), b = airport(to);
  if (a && b && a !== b) return null;
  if (a && b) return "Those are the same airport. Where are you flying to?";
  return `That trip is outside what GateCue covers today. It plans and books flights between West Coast airports: ${COVERAGE}. Trips in other time zones, including international ones, are next.`;
}

// Great-circle distance in miles, for scheduled block times on the demo schedule.
export function miles(a: Airport, b: Airport): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
