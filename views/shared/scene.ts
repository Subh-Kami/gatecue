// GateCue scene kit: layered 2.5D illustrations drawn in code. They stay crisp at any Echo Show zoom,
// weigh a few KB, and each layer can move on its own. The sky is continuous, not bucketed: palette(h)
// interpolates between keyframes, and the sun rises on the left and sets on the right, so 5:55 AM and
// 5:55 PM look different before you read a digit (the AM/PM mistake GateCue exists to catch).
// Original artwork for this project: no logos, liveries, signage or third-party marks.
import NOISE from "./noise.js";

type RGB = [number, number, number];
interface Key { h: number; top: string; mid: string; bot: string; sun: string; far: string; hill: string; near: string; ground: string; lights: number; stars: number; }
export interface Pal extends Key {}

// Keyframes by local hour. lights = artificial light on (0 day .. 1 night); stars fade in after dusk.
const KEYS: Key[] = [
  { h: 0,    top: "#060B20", mid: "#0E1838", bot: "#1B2750", sun: "#F4F1E6", far: "#1B2752", hill: "#121B3E", near: "#0B1230", ground: "#0A1029", lights: 1, stars: 1 },
  { h: 4.8,  top: "#0A1030", mid: "#1A2152", bot: "#3B3672", sun: "#F4F1E6", far: "#262F63", hill: "#18204A", near: "#0F1636", ground: "#0D1431", lights: 1, stars: .8 },
  { h: 6,    top: "#1C2862", mid: "#62579A", bot: "#F4A58E", sun: "#FFD9A8", far: "#4D4C88", hill: "#2D3066", near: "#1C1F4A", ground: "#181C41", lights: .8, stars: .12 },
  { h: 7.5,  top: "#5A90D8", mid: "#A6C1EA", bot: "#FFD5A4", sun: "#FFEBC0", far: "#8E9FCD", hill: "#5C6FA8", near: "#3C4C85", ground: "#354470", lights: .12, stars: 0 },
  { h: 12,   top: "#2C7BE6", mid: "#79B3F3", bot: "#CBE7FF", sun: "#FFF7DB", far: "#A2C4E8", hill: "#6F9DCD", near: "#4C77A8", ground: "#3D5E88", lights: 0, stars: 0 },
  { h: 16,   top: "#4A84D5", mid: "#A4C1E4", bot: "#FFE2B0", sun: "#FFF0C8", far: "#ABB9D8", hill: "#7D8EB9", near: "#56658F", ground: "#46547B", lights: 0, stars: 0 },
  { h: 18,   top: "#6A6CB6", mid: "#E79E7A", bot: "#FFCF8A", sun: "#FFE3A3", far: "#B3818D", hill: "#805C7D", near: "#563F64", ground: "#45354F", lights: .3, stars: 0 },
  { h: 19.6, top: "#282266", mid: "#8B4D8B", bot: "#F4886A", sun: "#FFB88A", far: "#5E4079", hill: "#402C5F", near: "#2B1F49", ground: "#221A3D", lights: .9, stars: .1 },
  { h: 21.5, top: "#090F2E", mid: "#151F49", bot: "#2B2E66", sun: "#F4F1E6", far: "#1E2754", hill: "#141C42", near: "#0D1434", ground: "#0B112A", lights: 1, stars: .9 },
  { h: 24,   top: "#060B20", mid: "#0E1838", bot: "#1B2750", sun: "#F4F1E6", far: "#1B2752", hill: "#121B3E", near: "#0B1230", ground: "#0A1029", lights: 1, stars: 1 },
];
const hex = (s: string): RGB => { if (s.length === 4) s = "#" + [...s.slice(1)].map((ch) => ch + ch).join(""); return [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) as RGB; };
const toHex = (c: RGB) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as RGB); };

export function palette(h: number): Pal {
  h = ((h % 24) + 24) % 24;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = (h - a.h) / (b.h - a.h || 1);
  const out: any = { h };
  for (const k of ["top", "mid", "bot", "sun", "far", "hill", "near", "ground"] as const) out[k] = mix(a[k], b[k], t);
  out.lights = a.lights + (b.lights - a.lights) * t; out.stars = a.stars + (b.stars - a.stars) * t;
  return out;
}
const night = (p: Pal) => p.lights > .6;
export function hourLabel(h: number) {
  if (h < 4.5 || h >= 21) return "Night"; if (h < 12) return "Morning"; if (h < 17) return "Afternoon"; return "Evening";
}

let uid = 0;
const nid = (p: string) => `${p}${(uid++).toString(36)}`;

class Canvas {
  defs = ""; body = "";
  grad(top: string, bot: string, o1 = 1, o2 = 1) { const id = nid("g"); this.defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}" stop-opacity="${o1}"/><stop offset="1" stop-color="${bot}" stop-opacity="${o2}"/></linearGradient>`; return `url(#${id})`; }
  fade(c: string, o: number) { const id = nid("f"); this.defs += `<linearGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="0"/><stop offset=".5" stop-color="${c}" stop-opacity="${o}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`; return `url(#${id})`; }
  radial(c: string, o: number) { const id = nid("r"); this.defs += `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${o}"/><stop offset=".4" stop-color="${c}" stop-opacity="${(o * .35).toFixed(3)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`; return `url(#${id})`; }
  add(s: string) { this.body += s; return this; }
  svg(label: string, vb: string, cls = "", scrim = .55, align = "xMidYMid") {
    const g = nid("n"), s = nid("s");
    const [, , w, h] = vb.split(" ").map(Number);
    return `<svg class="scene ${cls}" viewBox="${vb}" preserveAspectRatio="${align} slice" role="img" aria-label="${label}"><defs>${this.defs}<pattern id="${g}" width="28" height="28" patternUnits="userSpaceOnUse"><image href="data:image/png;base64,${NOISE}" width="28" height="28"/></pattern><linearGradient id="${s}" x1="0" y1="1" x2=".7" y2="0"><stop offset="0" stop-color="#040913" stop-opacity="${scrim}"/><stop offset=".5" stop-color="#040913" stop-opacity="${(scrim * .22).toFixed(2)}"/><stop offset="1" stop-color="#040913" stop-opacity="0"/></linearGradient></defs><g class="push">${this.body}</g><rect width="${w}" height="${h}" fill="url(#${g})" opacity=".08"/>${scrim ? `<rect width="${w}" height="${h}" fill="url(#${s})"/>` : ""}</svg>`;
  }
}

// ---- shared layers (320 x 240 space, horizon at y = 150) ---------------------------------------------
function skyLayers(c: Canvas, p: Pal, w = 320, horizon = 150, seed = 3) {
  const sky = nid("sky");
  c.defs += `<linearGradient id="${sky}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.top}"/><stop offset=".6" stop-color="${p.mid}"/><stop offset="1" stop-color="${p.bot}"/></linearGradient>`;
  c.add(`<rect x="-20" y="-20" width="${w + 40}" height="${horizon + 60}" fill="url(#${sky})"/>`);
  if (p.stars > .05) {
    let s = seed, out = "";
    const r = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < Math.round(28 * w / 320); i++) {
      const x = r() * w, y = r() * horizon * .7, big = r() > .82;
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${big ? 1.1 : .6}" fill="#fff" opacity="${(p.stars * (big ? .9 : .55)).toFixed(2)}"${big ? ` class="s-twinkle" style="--d:${(r() * 3).toFixed(1)}s"` : ""}/>`;
    }
    c.add(out);
  }
  // Sun: rises left, peaks at noon, sets right. Moon after dark.
  const h = p.h;
  if (h >= 5.6 && h <= 20.2) {
    const t = (h - 5.6) / 14.6, x = w * (.08 + t * .84), y = horizon - Math.sin(t * Math.PI) * (horizon * .8);
    const low = 1 - Math.sin(t * Math.PI);
    c.add(`<g class="s-sun"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(70 + low * 60).toFixed(0)}" fill="${c.radial(p.sun, .5 + low * .25)}"/>${low > .55 ? `<ellipse cx="${x.toFixed(1)}" cy="${horizon}" rx="${w * .6}" ry="26" fill="${c.radial(p.sun, .35)}"/>` : ""}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(10 + low * 4).toFixed(1)}" fill="${mix(p.sun, "#FFFFFF", .5)}"/></g>`);
  } else {
    c.add(`<g class="s-sun"><circle cx="${w * .76}" cy="44" r="40" fill="${c.radial("#DDE6FF", .22)}"/><circle cx="${w * .76}" cy="44" r="10" fill="#F2F0E6"/><circle cx="${w * .76 + 5}" cy="40" r="9" fill="${p.top}"/></g>`);
  }
  // Stratus clouds: long soft bands, lit from below at the ends of the day.
  const lit = mix("#FFFFFF", p.bot, night(p) ? .8 : .45);
  const op = night(p) ? .22 : .6;
  const band = (x: number, y: number, rx: number, ry: number, dur: number, dx: number) =>
    `<g class="s-drift" style="--dur:${dur}s;--dx:${dx}px"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${c.fade(lit, op)}"/><ellipse cx="${x + rx * .25}" cy="${y - ry * .6}" rx="${rx * .55}" ry="${ry * .7}" fill="${c.fade(lit, op * .7)}"/></g>`;
  c.add(band(w * .22, horizon * .38, w * .26, 5, 90, 22) + band(w * .7, horizon * .22, w * .2, 4, 120, -18) + band(w * .55, horizon * .62, w * .32, 4, 70, 26));
}
function volcano(c: Canvas, p: Pal, x: number, base: number, hgt: number, wid: number) {
  const snow = mix("#FFFFFF", p.bot, night(p) ? .55 : .25);
  const pk = base - hgt;
  c.add(`<path d="M${x - wid} ${base} C${x - wid * .55} ${base - hgt * .35} ${x - wid * .18} ${pk + 6} ${x - 6} ${pk + 1} Q${x} ${pk - 1} ${x + 6} ${pk + 1} C${x + wid * .2} ${pk + 8} ${x + wid * .6} ${base - hgt * .3} ${x + wid} ${base}Z" fill="${c.grad(mix(p.far, p.bot, .25), p.far)}"/><path d="M${x - 18} ${pk + 14} C${x - 12} ${pk + 7} ${x - 8} ${pk + 2} ${x - 6} ${pk + 1} Q${x} ${pk - 1} ${x + 6} ${pk + 1} C${x + 9} ${pk + 3} ${x + 14} ${pk + 8} ${x + 20} ${pk + 15} L${x + 12} ${pk + 12} L${x + 6} ${pk + 17} L${x} ${pk + 11} L${x - 7} ${pk + 18}Z" fill="${snow}"/>`);
}
function ridge(c: Canvas, p: Pal, y: number, w: number, color: string, amp: number, seed: number) {
  let d = `M-20 ${y + 30} L-20 ${y}`;
  for (let x = -20; x <= w + 20; x += 20) d += ` Q${x + 10} ${(y - amp * (.5 + .5 * Math.sin((x + seed) * .05))).toFixed(1)} ${x + 20} ${(y - amp * .3 * Math.cos((x + seed) * .03)).toFixed(1)}`;
  c.add(`<path d="${d} L${w + 20} ${y + 30}Z" fill="${c.grad(mix(color, p.bot, .3), color)}"/>`);
}
function trees(c: Canvas, y: number, w: number, color: string, size = 1) {
  let d = "";
  for (let x = -10; x <= w + 10; x += 7 * size) { const hgt = (8 + ((Math.round(x) * 37) % 9)) * size; d += `M${x.toFixed(1)} ${y} L${(x + 3.5 * size).toFixed(1)} ${(y - hgt).toFixed(1)} L${(x + 7 * size).toFixed(1)} ${y}Z`; }
  c.add(`<path d="${d}" fill="${color}"/><rect x="-10" y="${y - .5}" width="${w + 20}" height="6" fill="${color}"/>`);
}
function haze(c: Canvas, p: Pal, y: number, w: number, o = .35) {
  c.add(`<rect x="-20" y="${y - 14}" width="${w + 40}" height="18" fill="${c.grad(p.bot, p.bot, 0, o)}"/>`);
}

// A plain white jet in side profile, ~150 units long, nose right. No livery. Cabin windows glow after dark.
function jet(c: Canvas, p: Pal, x: number, y: number, s = 1, cls = "") {
  const lightBody = mix("#FFFFFF", p.mid, night(p) ? .5 : .08);
  const shade = mix(lightBody, p.near, .45);
  const fus = c.grad(mix(lightBody, "#FFFFFF", .4), shade);
  const win = p.lights > .4 ? "#FFD27A" : mix("#1A2940", lightBody, .15);
  let w = "";
  for (let i = 0; i < 17; i++) w += `<rect x="${(38 + i * 5.4).toFixed(1)}" y="-6.5" width="2.6" height="3" rx="1.3" fill="${win}"/>`;
  return `<g class="${cls}" transform="translate(${x} ${y}) scale(${s})"><ellipse cx="78" cy="15" rx="70" ry="3" fill="#000" opacity=".18"/><path d="M22 -12 L6 -40 C5 -42 7 -43 9 -43 H18 C20 -43 21 -42 22 -40 L46 -12Z" fill="${fus}"/><path d="M10 -4 L-2 -10 H6 L22 -4Z" fill="${shade}"/><path d="M14 -12 H128 C140 -12 150 -7 154 -1 C150 5 140 8 128 8 H26 C16 8 10 4 8 0 C6 -5 8 -12 14 -12Z" fill="${fus}"/><path d="M26 5 H128 C140 5 148 3 152 1 C148 6 140 8 128 8 H26 C18 8 12 6 10 3Z" fill="${shade}" opacity=".55"/><path d="M136 -10 C143 -9 149 -6 152 -3 H142 C140 -6 138 -8 136 -10Z" fill="${mix("#0F1B2E", p.mid, .15)}"/>${w}<path d="M76 2 L52 26 H63 L100 2Z" fill="${mix(shade, "#000", .12)}"/><rect x="70" y="9" width="26" height="11" rx="5.5" fill="${c.grad(mix(lightBody, "#fff", .2), mix(shade, "#000", .15))}"/><rect x="92" y="10" width="4" height="9" rx="2" fill="#0C1422"/><g fill="#141B26"><rect x="118" y="8" width="2" height="8"/><circle cx="119" cy="17" r="2.6"/><rect x="58" y="8" width="2" height="8"/><circle cx="59" cy="17" r="2.6"/><circle cx="65" cy="17" r="2.6"/></g><circle cx="10" cy="-42" r="1.5" fill="#FF5A5A" class="s-beacon"/>${p.lights > .3 ? `<circle cx="154" cy="-1" r="2" fill="#FFF4D2"/><path d="M154 -1 L230 -12 L230 12Z" fill="#FFF4D2" opacity="${(p.lights * .12).toFixed(2)}"/>` : ""}</g>`;
}

// ---- scenes (320 x 240) -------------------------------------------------------------------------------
// The airfield: same framing at every hour, a big jet on the taxiway, runway lights converging.
export function airfield(h: number, opts: { plane?: "taxi" | "gate" | "none"; compact?: boolean; scrim?: number; align?: string } = {}) {
  const p = palette(h), c = new Canvas();
  skyLayers(c, p);
  volcano(c, p, 118, 150, 78, 150);
  haze(c, p, 150, 320, .45);
  ridge(c, p, 146, 320, p.hill, 6, 40);
  trees(c, 152, 320, p.near, .9);
  c.add(`<rect x="-20" y="151" width="360" height="100" fill="${c.grad(mix(p.ground, p.bot, .2), mix(p.ground, "#000", .25))}"/>`);
  const rw = mix(p.ground, "#9FB2CC", night(p) ? .12 : .22), edge = mix(rw, "#FFFFFF", .35);
  c.add(`<path d="M150 153 L176 153 L330 250 L-40 250Z" fill="${c.grad(mix(rw, p.bot, .3), rw)}" opacity=".95"/><path d="M163 154 L145 250" stroke="${edge}" stroke-width="1.6" stroke-dasharray="3 4 6 6 9 8 12 9" opacity=".75"/>`);
  if (p.lights > .1) {
    let l = "";
    for (let i = 0; i < 9; i++) { const t = (i / 8) ** 1.7, yy = 154 + t * 96, r = .6 + t * 1.6;
      l += `<circle cx="${(150 - t * 190).toFixed(1)}" cy="${yy.toFixed(1)}" r="${r.toFixed(1)}" fill="#FFC56B" class="s-blink" style="--d:${(i * .15).toFixed(2)}s"/><circle cx="${(176 + t * 154).toFixed(1)}" cy="${yy.toFixed(1)}" r="${r.toFixed(1)}" fill="#FFC56B" class="s-blink" style="--d:${(i * .15 + .07).toFixed(2)}s"/>`; }
    c.add(`<g opacity="${Math.min(1, p.lights + .15).toFixed(2)}">${l}</g><ellipse cx="236" cy="222" rx="90" ry="10" fill="${c.radial("#FFD27A", p.lights * .35)}"/>`);
  }
  c.add(`<ellipse cx="160" cy="170" rx="160" ry="10" fill="${c.fade(p.bot, night(p) ? .12 : .22)}"/>`);
  const mode = opts.plane ?? "taxi";
  if (mode !== "none") c.add(`<g class="${mode === "taxi" ? "s-taxi" : ""}">${opts.compact ? jet(c, p, 196, 212, .76) : jet(c, p, 148, 206, 1.05)}</g>`);
  return c.svg(`${hourLabel(h)} at the airport`, "0 0 320 240", "", opts.scrim ?? .55, opts.align);
}

// Leaving home: craftsman houses, a street lamp, the ride waiting with headlights on.
export function home(h: number, opts: { car?: boolean; scrim?: number; align?: string } = {}) {
  const p = palette(h), c = new Canvas(), lit = p.lights;
  skyLayers(c, p, 320, 150, 11);
  ridge(c, p, 150, 320, p.hill, 8, 10);
  trees(c, 160, 320, p.near, 1.1);
  const win = lit > .3 ? "#FFCB6E" : mix(p.near, "#A9C8EA", .45);
  const house = (x: number, w: number, hgt: number, col: string, porch = false) => `<g><path d="M${x} 196 V${196 - hgt} L${x + w / 2} ${196 - hgt - w * .36} L${x + w} ${196 - hgt} V196Z" fill="${c.grad(mix(col, p.bot, .12), col)}"/><path d="M${x - 4} ${196 - hgt + 2} L${x + w / 2} ${196 - hgt - w * .36 - 2} L${x + w + 4} ${196 - hgt + 2}" fill="none" stroke="${mix(col, "#000", .35)}" stroke-width="3" stroke-linejoin="round"/><rect x="${x + w * .18}" y="${196 - hgt * .74}" width="${w * .22}" height="${hgt * .3}" rx="2" fill="${win}"${lit > .3 ? ` class="s-glow"` : ""}/><rect x="${x + w * .6}" y="${196 - hgt * .74}" width="${w * .22}" height="${hgt * .3}" rx="2" fill="${win}" opacity="${lit > .3 ? .5 : 1}"/>${porch && lit > .3 ? `<circle cx="${x + w * .5}" cy="${196 - hgt * .3}" r="16" fill="${c.radial("#FFD27A", .5)}"/><circle cx="${x + w * .5}" cy="${196 - hgt * .3}" r="1.8" fill="#FFE8B0"/>` : ""}</g>`;
  c.add(house(-6, 70, 44, mix(p.near, "#000", .2), true) + house(78, 48, 30, mix(p.near, p.hill, .35)) + house(252, 76, 50, mix(p.near, "#000", .25), true));
  c.add(`<rect x="-20" y="195" width="360" height="12" fill="${mix(p.ground, p.bot, .15)}"/><rect x="-20" y="206" width="360" height="40" fill="${c.grad(mix(p.ground, "#000", .1), mix(p.ground, "#000", .35))}"/>`);
  c.add(`<rect x="146" y="132" width="3" height="66" fill="${mix(p.near, "#000", .4)}"/><path d="M139 134 h17 l-3 -6 h-11z" fill="${mix(p.near, "#000", .4)}"/>${lit > .3 ? `<path d="M142 136 L118 212 L180 212 L153 136Z" fill="${c.grad("#FFD27A", "#FFD27A", lit * .28, 0)}"/><circle cx="147.5" cy="135" r="2.6" fill="#FFF0C8"/>` : ""}`);
  if (opts.car !== false) {
    const body = c.grad(mix("#E9EEF5", p.mid, night(p) ? .55 : .1), mix("#9AA8BC", p.near, .4));
    c.add(`<g class="s-idle">${lit > .3 ? `<path d="M258 206 L340 190 L340 230 Z" fill="${c.grad("#FFF1C4", "#FFF1C4", .28, .02)}"/>` : ""}<ellipse cx="208" cy="222" rx="58" ry="4" fill="#000" opacity=".3"/><path d="M156 216 h98 c4 0 7-3 7-7 v-7 c0-4-3-6-6-7 l-22-5 -15-12 c-3-2-6-3-10-3 h-30 c-5 0-8 2-11 6 l-9 12 c-4 1-7 4-7 8 v8 c0 4 3 7 5 7z" fill="${body}"/><path d="M181 180 h26 l15 13 h-50z" fill="${lit > .3 ? "#23344F" : mix("#A9C8EA", p.bot, .3)}"/><rect x="196" y="180" width="2.5" height="13" fill="${mix("#9AA8BC", p.near, .4)}"/><circle cx="180" cy="216" r="9" fill="#0B0F17"/><circle cx="180" cy="216" r="4" fill="#3A4556"/><circle cx="236" cy="216" r="9" fill="#0B0F17"/><circle cx="236" cy="216" r="4" fill="#3A4556"/><rect x="255" y="199" width="6" height="4" rx="2" fill="#FFF6D6"/><rect x="156" y="200" width="5" height="4" rx="2" fill="#FF4F4F"/></g>`);
  }
  return c.svg(`${hourLabel(h)}, leaving home`, "0 0 320 240", "", opts.scrim ?? .55, opts.align);
}

// The food stop: a corner cafe with a striped awning, a warm window and the order waiting outside.
export function cafe(h: number, opts: { scrim?: number; align?: string } = {}) {
  const p = palette(h), c = new Canvas(), lit = p.lights;
  skyLayers(c, p, 320, 150, 5);
  ridge(c, p, 152, 320, p.hill, 6, 70);
  trees(c, 160, 320, p.near, 1);
  const wall = mix(p.near, "#7A5140", .4), glow = lit > .2 ? "#FFC978" : mix("#FFE7BD", p.bot, .25);
  c.add(`<rect x="52" y="64" width="216" height="136" fill="${c.grad(mix(wall, p.bot, .15), mix(wall, "#000", .25))}"/><rect x="46" y="58" width="228" height="10" rx="2" fill="${mix(wall, "#000", .3)}"/><rect x="72" y="136" width="124" height="60" rx="4" fill="${c.grad(mix(glow, "#FFFFFF", .25), glow)}" class="s-glow"/><g fill="${mix(glow, "#4A2E22", .6)}"><rect x="84" y="170" width="34" height="26" rx="2"/><circle cx="146" cy="160" r="7"/><path d="M137 196 v-20 c0-5 4-8 9-8 s9 3 9 8 v20z"/><rect x="164" y="176" width="22" height="3" rx="1.5"/></g>${lit > .2 ? `<ellipse cx="134" cy="206" rx="80" ry="8" fill="${c.radial("#FFC978", .5)}"/>` : ""}<rect x="206" y="136" width="42" height="64" rx="3" fill="${mix(wall, "#000", .45)}"/><circle cx="240" cy="170" r="1.8" fill="${glow}"/>`);
  let awn = "";
  for (let i = 0; i < 11; i++) awn += `<path d="M${(60 + i * 18.4).toFixed(1)} 112 h18.4 v14 a9.2 9.2 0 0 1 -18.4 0z" fill="${i % 2 ? "#F6EEE2" : "#E0684A"}"/>`;
  c.add(`<path d="M56 100 H264 L270 114 H50Z" fill="#C4553A"/>${awn}`);
  c.add(`<rect x="-20" y="198" width="360" height="50" fill="${c.grad(mix(p.ground, p.bot, .15), mix(p.ground, "#000", .35))}"/>`);
  c.add(`<g transform="translate(258 170)"><path d="M0 30 h24 l-3 -28 h-18z" fill="#C9A06E"/><path d="M3 2 h18 l-1 -6 h-16z" fill="#A9814F"/><path d="M30 30 h13 l2.5 -22 h-18z" fill="#F4EFE7"/><rect x="26" y="4" width="21" height="4" rx="2" fill="#FFFFFF"/><path d="M34 -2 q3 -6 0 -12 M40 -2 q3 -6 0 -12" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="1.4" fill="none" class="s-steam"/></g>`);
  return c.svg(`${hourLabel(h)}, food stop`, "0 0 320 240", "", opts.scrim ?? .55, opts.align);
}

// Arrival city on the bay: hills, towers with lit windows, a suspension bridge, fog drifting in.
export function city(h: number, opts: { scrim?: number; align?: string } = {}) {
  const p = palette(h), c = new Canvas(), lit = p.lights;
  skyLayers(c, p, 320, 160, 17);
  ridge(c, p, 168, 320, p.hill, 10, 120);
  const tc = mix(p.near, p.far, .3);
  const tower = (x: number, w: number, hgt: number, k: number) => {
    const col = mix(tc, "#000", k);
    let win = "";
    if (lit > .2) for (let yy = 200 - hgt + 8; yy < 194; yy += 6) for (let xx = x + 3; xx < x + w - 3; xx += 4.5) if (((Math.round(xx) * 7 + yy * 3) % 5) < 2) win += `<rect x="${xx.toFixed(1)}" y="${yy}" width="2" height="2.6" fill="#FFD68A" opacity="${(lit * .85).toFixed(2)}"/>`;
    return `<rect x="${x}" y="${200 - hgt}" width="${w}" height="${hgt}" fill="${c.grad(mix(col, p.bot, .2), col)}"/><rect x="${x}" y="${200 - hgt}" width="${(w * .35).toFixed(1)}" height="${hgt}" fill="#FFFFFF" opacity=".05"/>${win}`;
  };
  c.add(tower(104, 16, 72, .05) + tower(122, 24, 100, .12) + tower(148, 15, 62, 0) + tower(165, 19, 88, .15) + tower(186, 28, 116, .06) + tower(216, 15, 70, 0) + tower(233, 22, 82, .12));
  c.add(`<path d="M193 84 L200 60 L207 84Z" fill="${mix(tc, "#000", .06)}"/>`);
  c.add(`<rect x="-20" y="198" width="360" height="50" fill="${c.grad(mix(p.bot, p.ground, .45), mix(p.ground, "#000", .3))}"/><ellipse cx="200" cy="206" rx="120" ry="5" fill="${c.fade(p.bot, .4)}"/>`);
  const br = mix("#D8634A", p.near, lit > .5 ? .55 : .12);
  c.add(`<g stroke="${br}" fill="none" stroke-linecap="round"><path d="M-20 199 L96 199" stroke-width="3.5"/><path d="M18 199 V140 M68 199 V140" stroke-width="4.5"/><path d="M-20 176 Q8 150 18 142 Q43 196 68 142 Q82 160 96 199" stroke-width="1.5"/></g>`);
  c.add(`<g class="s-drift" style="--dur:50s;--dx:34px"><path d="M-60 192 Q20 176 110 188 T290 184 T400 190 V204 H-60Z" fill="#FFFFFF" opacity="${night(p) ? .07 : .32}"/></g>`);
  if (lit > .3) c.add(`<g opacity=".55">${[20, 44, 70, 150, 200, 240].map((x) => `<rect x="${x}" y="202" width="1.6" height="12" fill="#FFD68A"/>`).join("")}</g>`);
  return c.svg(`${hourLabel(h)} in the city`, "0 0 320 240", "", opts.scrim ?? .55, opts.align);
}

// The whole trip in one panorama (960 x 240): the sky shifts from the leave-home hour on the left to the
// landing hour on the right; the car drives to the terminal, then the plane flies the arc to the city.
export interface JStop { x: number; kind: "leave" | "stop" | "airport" | "land" | "goal" }
export function journey(motion: boolean, leaveH: number, landH: number, stops: JStop[]) {
  const a = palette(leaveH), b = palette(landH), m = palette((leaveH + landH) / 2), c = new Canvas();
  const sky = nid("j"), hz = nid("jh"), hm = nid("jm");
  c.defs += `<linearGradient id="${sky}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a.top}"/><stop offset=".5" stop-color="${m.top}"/><stop offset="1" stop-color="${b.top}"/></linearGradient><linearGradient id="${hz}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${a.bot}"/><stop offset=".5" stop-color="${m.bot}"/><stop offset="1" stop-color="${b.bot}"/></linearGradient><linearGradient id="${hm}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="${hm}"><rect y="30" width="960" height="160" fill="url(#${hm}g)"/></mask>`;
  c.add(`<rect width="960" height="240" fill="url(#${sky})"/><rect y="30" width="960" height="160" fill="url(#${hz})" mask="url(#${hm})"/>`);
  if (a.stars > .05) { let s = 21, o = ""; const r = () => (s = (s * 9301 + 49297) % 233280) / 233280; for (let i = 0; i < 40; i++) { const x = r() * 420, y = r() * 110; o += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r() > .8 ? 1.1 : .6}" fill="#fff" opacity="${(a.stars * (.4 + r() * .5)).toFixed(2)}"/>`; } c.add(o); }
  const bh = b.h;
  if (bh >= 5.6 && bh <= 20.2) { const sy = (150 - Math.sin(((bh - 5.6) / 14.6) * Math.PI) * 110).toFixed(0); c.add(`<circle cx="880" cy="${sy}" r="90" fill="${c.radial(b.sun, .55)}"/><circle cx="880" cy="${sy}" r="11" fill="${mix(b.sun, "#fff", .5)}"/>`); }
  else c.add(`<circle cx="880" cy="46" r="10" fill="#F2F0E6"/><circle cx="885" cy="42" r="9" fill="${b.top}"/>`);
  const far = mix(a.far, b.far, .35);
  c.add(`<path d="M-10 176 L60 160 L120 166 L190 150 L230 118 Q240 110 250 118 L300 150 L380 146 L470 162 L560 158 L660 166 L760 160 L970 170 V240 H-10Z" fill="${c.grad(mix(far, a.bot, .3), far)}"/><path d="M222 126 L230 118 Q240 110 250 118 L258 127 L250 124 L244 130 L238 124 L230 131Z" fill="${mix("#FFFFFF", a.bot, .35)}"/>`);
  const tc = mix(b.near, b.far, .3);
  let cty = "";
  [[840, 14, 60], [856, 20, 84], [878, 13, 50], [893, 17, 72], [912, 22, 96], [936, 14, 58]].forEach(([x, w, hh], i) => {
    cty += `<rect x="${x}" y="${190 - hh}" width="${w}" height="${hh}" fill="${mix(tc, "#000", i % 2 ? .12 : 0)}"/>`;
    if (b.lights > .3) for (let y = 196 - hh; y < 186; y += 7) cty += `<rect x="${x + 3}" y="${y}" width="${w - 6}" height="1.6" fill="#FFD68A" opacity="${(b.lights * .45).toFixed(2)}"/>`;
  });
  c.add(cty + `<path d="M917 94 L923 76 L929 94Z" fill="${tc}"/>`);
  c.add(`<path d="M-10 186 Q200 170 420 182 T960 178 V240 H-10Z" fill="${c.grad(mix(a.hill, b.hill, .5), mix(a.near, b.near, .5))}"/>`);
  let tr = ""; for (let x = 0; x < 400; x += 8) { const hh = 8 + ((x * 37) % 9); tr += `M${x} 186 L${x + 4} ${186 - hh} L${x + 8} 186Z`; }
  c.add(`<path d="${tr}" fill="${mix(a.near, "#000", .15)}"/>`);
  const gnd = mix(a.ground, b.ground, .5);
  c.add(`<rect y="196" width="960" height="44" fill="${c.grad(gnd, mix(gnd, "#000", .35))}"/>`);
  const road = mix(a.ground, "#9FB2CC", .25);
  c.add(`<path d="M0 206 H470" stroke="${road}" stroke-width="7" stroke-linecap="round"/><path d="M0 206 H470" stroke="${mix(road, "#fff", .55)}" stroke-width="1.2" stroke-dasharray="9 9" opacity=".6"/>`);
  const hc = mix(a.near, "#000", .25), win = a.lights > .3 ? "#FFCB6E" : mix(a.near, "#A9C8EA", .5);
  c.add(`<path d="M14 200 V180 L32 166 L50 180 V200Z" fill="${hc}"/><rect x="22" y="184" width="7" height="7" rx="1" fill="${win}"/><path d="M56 200 V186 L68 177 L80 186 V200Z" fill="${mix(hc, a.hill, .3)}"/>`);
  if (stops.some((st) => st.kind === "stop")) {
    const glow = a.lights > .3 ? "#FFC978" : mix("#FFE7BD", a.bot, .25);
    let aw = ""; for (let i = 0; i < 5; i++) aw += `<path d="M${226 + i * 9.6} 180 h9.6 v5 a4.8 4.8 0 0 1 -9.6 0z" fill="${i % 2 ? "#F6EEE2" : "#E0684A"}"/>`;
    c.add(`<rect x="228" y="176" width="44" height="24" fill="${mix(a.near, "#7A5140", .35)}"/><rect x="234" y="188" width="22" height="10" rx="1.5" fill="${glow}"/><path d="M224 174 H276 L278 180 H222Z" fill="#C4553A"/>${aw}`);
  }
  const tcol = mix(mix(a.near, b.near, .5), "#000", .1);
  c.add(`<path d="M400 200 V176 Q450 160 520 176 V200Z" fill="${c.grad(mix(tcol, m.bot, .2), tcol)}"/><rect x="408" y="182" width="104" height="6" rx="2" fill="${m.lights > .3 ? "#FFD68A" : mix("#A9C8EA", m.bot, .3)}" opacity=".8"/><rect x="530" y="148" width="7" height="52" fill="${tcol}"/><path d="M522 140 h23 l-3 10 h-17z" fill="${tcol}"/><rect x="524" y="142" width="19" height="4" fill="${m.lights > .3 ? "#9FE3FF" : mix("#A9C8EA", m.bot, .2)}" opacity=".8"/>`);
  const arc = "M 540 196 C 620 60, 780 50, 850 150";
  c.add(`<path d="${arc}" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="2" stroke-dasharray="3 7"/><path d="${arc}" fill="none" stroke="#FFFFFF" stroke-opacity=".9" stroke-width="2.4" stroke-linecap="round" class="m-draw" style="--len:420"/>`);
  c.add(`<g class="j-car"><g transform="translate(-40 0)"><rect x="0" y="195" width="30" height="9" rx="4" fill="#F3F6FA"/><path d="M5 195 l5 -7 h12 l5 7z" fill="#F3F6FA"/><rect x="10" y="189.5" width="11" height="5" rx="1" fill="#23344F"/><circle cx="7" cy="205" r="3" fill="#0B0F17"/><circle cx="23" cy="205" r="3" fill="#0B0F17"/><rect x="28" y="197" width="3" height="2.4" rx="1" fill="#FFF3C9"/></g></g>`);
  c.add(`<g>${jet(c, b, -32, 0, .4)}<animateMotion ${motion ? `dur="2.4s" begin="1.1s" calcMode="spline" keyPoints="0;.55" keyTimes="0;1" keySplines=".3 0 .1 1"` : `dur="0.001s" keyPoints="0;.55" keyTimes="0;1" calcMode="linear"`} fill="freeze" rotate="auto" path="${arc}"/></g>`);
  const col = { leave: "#2F6BE6", stop: "#FFFFFF", airport: "#FFB547", land: "#FFFFFF", goal: "#5FD68E" } as const;
  c.add(stops.map((s, i) => { const y = s.kind === "land" || s.kind === "goal" ? 176 : 206; return `<g class="m-pop" style="--d:${250 + i * 110}ms;transform-origin:${s.x}px ${y}px"><circle cx="${s.x}" cy="${y}" r="11" fill="${col[s.kind]}" opacity=".25"/><circle cx="${s.x}" cy="${y}" r="6.5" fill="${col[s.kind]}" stroke="#0B1522" stroke-width="2.5"/></g>`; }).join(""));
  return c.svg("Your trip from home to the meeting", "0 0 960 240", "journey", 0, "xMidYMax");
}
