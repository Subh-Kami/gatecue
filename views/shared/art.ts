// Original illustration and icon kit for GateCue cards. No third-party artwork or trademarks.
const I = (d: string, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const icon = {
  plane: I(`<path d="M2.5 13.5l19-8-5.5 15-3.5-6.5z"/><path d="M12.5 14l3.5-3.5"/>`),
  walk: I(`<circle cx="13" cy="4" r="2"/><path d="M11 21l2-6 3 3v4M9 12l2-4 4 2 2 3M7 21l3-7"/>`),
  car: I(`<path d="M5 16h14M6 16l1.5-5h9L18 16M6 16v3M18 16v3"/><circle cx="8" cy="16" r="0.5"/><circle cx="16" cy="16" r="0.5"/>`),
  check: I(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  checkCircle: I(`<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>`),
  alert: I(`<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.01"/>`),
  clock: I(`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`),
  card: I(`<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>`),
  refund: I(`<path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>`),
  noRefund: I(`<circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/>`),
  mail: I(`<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6 8.5-6"/>`),
  expand: I(`<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>`),
  arrow: I(`<path d="M5 12h14M13 6l6 6-6 6"/>`),
  pin: I(`<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>`),
};

export const LOGO = `<svg viewBox="0 0 22 24" aria-hidden="true"><path d="M3 21V10a8 8 0 0 1 16 0v11" fill="none" stroke="var(--brand)" stroke-width="2.6" stroke-linecap="round"/><circle cx="11" cy="15" r="2.8" fill="var(--brand)"/></svg>`;

export function attribution(label = "GateCue") {
  return `<div class="gc-attrib m-fade">${LOGO}<span>${label}</span></div>`;
}

export function hourFromDisplay(display: string): number {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(display);
  if (!m) return 12;
  let h = Number(m[1]) % 12; if (m[3].toUpperCase() === "PM") h += 12;
  return h + Number(m[2]) / 60;
}

// ---- Time of day ---------------------------------------------------------------------------
export function localHour(iso: string, tz: string): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).split(":").map(Number);
  return p[0] + p[1] / 60;
}
function skyStops(h: number): [string, string, string] {
  if (h < 4.5 || h >= 21) return ["#0A1430", "#16244D", "night"];
  if (h < 6) return ["#26306A", "#C8718C", "predawn"];
  if (h < 9) return ["#6FA8DC", "#F7B98B", "morning"];
  if (h < 16) return ["#3F8FE0", "#A9D6FF", "day"];
  if (h < 19) return ["#E8845E", "#F6C27A", "golden"];
  return ["#3B2A78", "#C8577A", "dusk"];
}
export function dayPartName(h: number): string {
  if (h < 4.5 || h >= 21) return "Night";
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

let skyId = 0;
// A small landscape whose sky, sun or moon match the hour: AM and PM look different before you read a word.
export function skyTile(iso: string, tz: string, label = ""): string {
  const h = localHour(iso, tz);
  const [top, bottom, kind] = skyStops(h);
  const id = `sky${skyId++}`;
  const isNight = kind === "night" || kind === "predawn";
  const t = Math.min(1, Math.max(0, (h - 5.5) / 14)); // sunrise-ish to sunset-ish
  const sx = 104 + t * 36, sy = 74 - Math.sin(t * Math.PI) * 50;
  const body = isNight
    ? `<g class="m-sun"><circle cx="118" cy="30" r="11" fill="#F4F1E6"/><circle cx="123" cy="26" r="10" fill="url(#${id})"/></g>
       ${[[20, 18], [44, 30], [70, 14], [92, 36], [140, 52], [34, 50], [60, 44]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 2 ? 1 : 1.4}" fill="#fff" opacity=".85"/>`).join("")}`
    : `<g class="m-sun"><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="11" fill="${kind === "golden" ? "#FFE3A3" : "#FFF3C4"}"/><circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="18" fill="#FFF3C4" opacity=".25"/></g>`;
  return `<svg class="sky" viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${label || dayPartName(h)} sky">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1522" stop-opacity="0"/><stop offset="1" stop-color="#0B1522" stop-opacity=".55"/></linearGradient></defs>
    <rect width="160" height="110" fill="url(#${id})"/>${body}
    <path d="M0 86 C30 72 52 80 78 74 C104 68 126 78 160 70 V110 H0Z" fill="#0B1522" opacity=".45"/>
    <path d="M0 96 C28 88 60 94 90 88 C118 83 140 90 160 86 V110 H0Z" fill="#0B1522" opacity=".75"/>
    <rect y="55" width="160" height="55" fill="url(#${id}s)"/>
  </svg>`;
}

// ---- Route arc with a plane that glides along it ----------------------------------------------
export function routeArc(from: string, to: string, progress = 0.5): string {
  const d = "M 24 78 Q 160 -6 296 78";
  return `<div class="route" style="--to:${Math.round(progress * 100)}%">
    <svg viewBox="0 0 320 100" aria-hidden="true">
      <path d="${d}" fill="none" stroke="var(--line)" stroke-width="2" stroke-dasharray="3 6"/>
      <path d="${d}" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round" class="m-draw" style="--len:330"/>
      <circle cx="24" cy="78" r="5" fill="var(--surface)" stroke="var(--text-primary)" stroke-width="2.5"/>
      <circle cx="296" cy="78" r="5" fill="var(--text-primary)"/>
    </svg>
    <div class="plane m-plane" style="offset-path: path('${d}')">${icon.plane}</div>
    <span class="code from">${from}</span><span class="code to">${to}</span>
  </div>`;
}

// ---- Digits that roll in ------------------------------------------------------------------------
export function rollText(s: string): string {
  return [...s].map((c, k) => (/\d/.test(c) ? `<span class="roll" style="--k:${k}"><span>${c}</span></span>` : `<span>${c === " " ? "&nbsp;" : c}</span>`)).join("");
}
// Every character flips in (confirmation codes, airport codes): a departure board, not a fade.
export function flipText(s: string, start = 0): string {
  return `<span class="fliptext">${[...s].map((c, k) => (c === " " ? " " : `<span class="roll" style="--k:${k + start}"><span>${c.replace(/[&<>"']/g, (x) => `&#${x.charCodeAt(0)};`)}</span></span>`)).join("")}</span>`;
}
export function bigTime(display: string, cls = ""): string {
  const [t, ap] = display.split(" ");
  const k = (ap ?? "").toLowerCase();
  return `<span class="bigtime gc-num ${cls}">${rollText(t)}<span class="ampm ${k === "am" || k === "pm" ? k : ""}" style="--stamp:${200 + t.length * 55 + 260}ms">${ap ?? ""}</span></span>`;
}
