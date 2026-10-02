// Built-in demo schedule, so GateCue runs end to end with no API keys (judges, CI, offline filming).
// Illustrative only: a hand-written list of Seattle (SEA) to San Francisco (SFO) departures, applied to whatever
// day is asked for. Live schedules come from AeroDataBox when RAPIDAPI_KEY is set. Served in AeroDataBox's
// response shape so the rest of GateCue can't tell the difference (and can't treat it differently).
const TZ = "America/Los_Angeles";
const SCHEDULE: Array<[string, string, string, string]> = [
  // [number, airline, departs (local HH:MM), arrives (local HH:MM)]
  ["AS 725", "Alaska", "06:39", "08:49"],
  ["UA 499", "United", "07:11", "09:30"],
  ["DL 1134", "Delta Air Lines", "07:16", "09:38"],
  ["UA 2831", "United", "09:05", "11:24"],
  ["AS 528", "Alaska", "09:59", "12:26"],
  ["DL 1412", "Delta Air Lines", "10:51", "13:08"],
  ["AS 655", "Alaska", "11:54", "14:23"],
  ["UA 2281", "United", "13:19", "15:35"],
  ["DL 3707", "Delta Air Lines", "14:45", "17:05"],
  ["AS 680", "Alaska", "15:44", "18:01"],
  ["UA 5841", "United", "17:21", "19:51"],
  ["DL 3991", "Delta Air Lines", "17:55", "20:18"],
  ["AS 619", "Alaska", "19:36", "21:49"],
  ["DL 2635", "Delta Air Lines", "21:35", "23:56"],
];

export function demoScheduleOn(): boolean {
  return !process.env.RAPIDAPI_KEY && (process.env.GATECUE_SCHEDULE === "demo" || !!process.env.GATECUE_DEMO_NOW);
}

// "-07:00" for a given local date in Seattle.
function offsetOn(day: string): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "-08:00";
}
const leg = (day: string, n: string, al: string, dep: string, arr: string) => {
  const off = offsetOn(day);
  return {
    number: n, status: "Expected", airline: { name: al },
    departure: { airport: { iata: "SEA", name: "Seattle-Tacoma" }, scheduledTime: { local: `${day} ${dep}${off}` }, terminal: "M" },
    arrival: { airport: { iata: "SFO", name: "San Francisco" }, scheduledTime: { local: `${day} ${arr}${off}` } },
  };
};

// Answers the two AeroDataBox paths GateCue uses.
export function demoAeroGet(path: string): unknown {
  const dep = /^\/flights\/airports\/iata\/([A-Z]{3})\/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})\/(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(path);
  if (dep) {
    const [, from, day, a, , b] = dep;
    if (from !== "SEA") return { departures: [] };
    return { departures: SCHEDULE.filter(([, , d]) => d >= a && d <= b).map(([n, al, d, r]) => leg(day, n, al, d, r)) };
  }
  const num = /^\/flights\/number\/([A-Z0-9]+)\/(\d{4}-\d{2}-\d{2})/.exec(path);
  if (num) {
    const f = SCHEDULE.find(([n]) => n.replace(/\s+/g, "") === num[1].toUpperCase());
    return f ? [leg(num[2], ...f)] : [];
  }
  return null;
}
