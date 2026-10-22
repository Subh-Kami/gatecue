// Traveller memory: profile, saved places, preferences and upcoming trips.
// Stored in DynamoDB (table GC_MEMORY_TABLE, pk/sk strings) when AWS is on (GC_AWS=1),
// otherwise kept in this process. If DynamoDB fails, GateCue keeps working from the in-process copy.
import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import type { FlightRef } from "./plan.js";

export interface Place { name: string; label: string; lon: number; lat: number }
export interface Preferences { bufferMinutes: number; notes: string[] }
export interface Profile { name: string; home: Place; places: Place[]; preferences: Preferences }
export interface Trip { id: string; goalTime: string; goalPlace: string; origin: string; pickupStop?: string; flight: FlightRef; checkinCutoffMinutes: number }

// Demo traveller. Names and places are anonymised from the real story.
const SEED_PROFILE: Profile = {
  name: "Alex",
  home: { name: "home", label: "Home, Capitol Hill", lon: -122.3195, lat: 47.6235 },
  places: [
    { name: "Sam", label: "Sam's place", lon: -122.3110, lat: 47.5795 },
    { name: "SEA", label: "Seattle-Tacoma International Airport (SEA)", lon: -122.3015, lat: 47.4433 },
  ],
  preferences: { bufferMinutes: 15, notes: [] },
};
const SEED_TRIPS: Trip[] = [{
  id: "sfo-oct15",
  goalTime: "2026-10-15T11:00:00-07:00",
  goalPlace: "Market St office",
  origin: "Home, Capitol Hill",
  pickupStop: "Sam's place",
  flight: { number: "CQ 725", from: "SEA", to: "SFO", departure: "2026-10-15T06:39:00-07:00", arrival: "2026-10-15T08:49:00-07:00" },
  checkinCutoffMinutes: 45,
}];

const USER = process.env.GC_USER ?? "demo-traveller";
const TABLE = process.env.GC_MEMORY_TABLE ?? "gatecue-memory";
const useDynamo = () => process.env.GC_AWS === "1";
let ddb: DynamoDBClient | undefined;
const db = () => (ddb ??= new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" }));

// In-process copy: the fallback, and a read-through cache.
const local = { profile: structuredClone(SEED_PROFILE), trips: structuredClone(SEED_TRIPS) };
let lastSource: "DynamoDB" | "in-memory" = "in-memory";
let warned = false;
function fallback(err: unknown) {
  lastSource = "in-memory";
  if (!warned) { warned = true; console.warn(`[memory] DynamoDB unavailable, using in-memory copy: ${(err as Error)?.name ?? err}`); }
}

const pk = `USER#${USER}`;
async function getItem<T>(sk: string): Promise<T | undefined> {
  const r = await db().send(new GetItemCommand({ TableName: TABLE, Key: { pk: { S: pk }, sk: { S: sk } }, ConsistentRead: true }));
  return r.Item?.data?.S ? (JSON.parse(r.Item.data.S) as T) : undefined;
}
async function putItem(sk: string, data: unknown, onlyIfNew = false) {
  try {
    await db().send(new PutItemCommand({
      TableName: TABLE,
      Item: { pk: { S: pk }, sk: { S: sk }, data: { S: JSON.stringify(data) }, updatedAt: { S: new Date().toISOString() } },
      ...(onlyIfNew ? { ConditionExpression: "attribute_not_exists(pk)" } : {}),
    }));
  } catch (e) {
    if ((e as Error).name !== "ConditionalCheckFailedException") throw e;
  }
}

export async function getProfile(): Promise<Profile> {
  if (!useDynamo()) return local.profile;
  try {
    let p = await getItem<Profile>("PROFILE");
    if (!p) { await putItem("PROFILE", SEED_PROFILE, true); p = (await getItem<Profile>("PROFILE")) ?? structuredClone(SEED_PROFILE); }
    p.preferences = { ...SEED_PROFILE.preferences, ...p.preferences };
    local.profile = p; lastSource = "DynamoDB";
    return p;
  } catch (e) { fallback(e); return local.profile; }
}

export async function getTrips(): Promise<Trip[]> {
  if (!useDynamo()) return local.trips;
  try {
    const q = () => db().send(new QueryCommand({
      TableName: TABLE, KeyConditionExpression: "pk = :pk AND begins_with(sk, :t)",
      ExpressionAttributeValues: { ":pk": { S: pk }, ":t": { S: "TRIP#" } }, ConsistentRead: true,
    }));
    let r = await q();
    if (!r.Items?.length) {
      for (const t of SEED_TRIPS) await putItem(`TRIP#${t.id}`, t, true);
      r = await q();
    }
    const trips = (r.Items ?? []).map((i) => JSON.parse(i.data!.S!) as Trip);
    local.trips = trips; lastSource = "DynamoDB";
    return trips;
  } catch (e) { fallback(e); return local.trips; }
}

export async function updatePreferences(patch: Partial<Pick<Preferences, "bufferMinutes">> & { note?: string }): Promise<Preferences> {
  const p = await getProfile();
  if (patch.bufferMinutes !== undefined) p.preferences.bufferMinutes = patch.bufferMinutes;
  if (patch.note) p.preferences.notes = [...p.preferences.notes.filter((n) => n !== patch.note), patch.note].slice(-10);
  local.profile = p;
  if (useDynamo()) {
    try { await putItem("PROFILE", p); lastSource = "DynamoDB"; } catch (e) { fallback(e); }
  }
  return p.preferences;
}

// Trips are keyed by id (sk TRIP#<id>). Saving the same goal again updates that trip instead of adding a copy.
async function putTrip(t: Trip) {
  if (!useDynamo()) return;
  try { await putItem(`TRIP#${t.id}`, t); lastSource = "DynamoDB"; } catch (e) { fallback(e); }
}

// After a rebooking, the trip remembers the new flight (so the next plan, glance and email use it).
export async function updateTripFlight(goalTime: string, flight: FlightRef): Promise<Trip | undefined> {
  const trips = await getTrips();
  const t = trips.find((x) => new Date(x.goalTime).getTime() === new Date(goalTime).getTime());
  if (!t) return undefined;
  t.flight = flight;
  await putTrip(t);
  return t;
}

// Remember a trip the traveller described (from plan_trip). Same goal time = same trip.
export async function saveTrip(input: Omit<Trip, "id" | "checkinCutoffMinutes"> & { checkinCutoffMinutes?: number }): Promise<Trip> {
  const trips = await getTrips();
  const same = trips.find((x) => new Date(x.goalTime).getTime() === new Date(input.goalTime).getTime());
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(input.goalTime)).replaceAll("-", "");
  const t: Trip = { checkinCutoffMinutes: 45, ...same, ...input, id: same?.id ?? `trip-${day}-${input.flight.to.toLowerCase()}-${Date.now().toString(36)}` } as Trip;
  if (same) Object.assign(same, t); else trips.push(t);
  local.trips = trips;
  await putTrip(t);
  return t;
}

// Back to the seeded demo traveller (local and DynamoDB). Used by `npm run reset:memory`.
export async function resetMemory(): Promise<void> {
  resetLocalMemory();
  if (!useDynamo()) return;
  const r = await db().send(new QueryCommand({ TableName: TABLE, KeyConditionExpression: "pk = :pk", ExpressionAttributeValues: { ":pk": { S: pk } } }));
  for (const i of r.Items ?? []) await db().send(new DeleteItemCommand({ TableName: TABLE, Key: { pk: i.pk!, sk: i.sk! } }));
  await getProfile(); await getTrips(); // reseed
}

export function memorySource() { return lastSource; }

// "Sam's place", "sam", "home", "SEA" -> a saved place with coordinates.
export function findPlace(profile: Profile, text: string | undefined): Place | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const all = [profile.home, ...profile.places];
  return all.find((p) => p.label.toLowerCase() === t)
    ?? all.find((p) => t.includes(p.name.toLowerCase()) || p.label.toLowerCase().includes(t));
}

// Test helper: back to the seeded state.
export function resetLocalMemory() { local.profile = structuredClone(SEED_PROFILE); local.trips = structuredClone(SEED_TRIPS); }
