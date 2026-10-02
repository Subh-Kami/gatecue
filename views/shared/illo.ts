// Generated illustrations (see design/ART_DIRECTION.md), served by the GateCue server from /assets and
// declared in each card's _meta.ui.csp.resourceDomains. The build injects the asset manifest; the server
// fills in its public origin. Time of day picks the plate, so a PM flight is shown in PM light.
interface Entry { img: string; sm: string; w: number; h: number; video?: string }
declare global { interface Window { GC_ASSETS?: { base: string; m: Record<string, Record<string, Entry>> } } }

export type Kind = "airfield" | "terminal" | "home" | "city" | "journey";
const SLOTS: Record<Kind, [number, string][]> = {
  // [until hour, slot]
  airfield: [[4.5, "night"], [6.6, "predawn"], [10, "morning"], [16, "day"], [19, "golden"], [21, "dusk"], [24, "night"]],
  terminal: [[24, "dawn"]],
  home: [[4, "night"], [7, "predawn"], [19, "predawn"], [24, "night"]],
  city: [[16, "morning"], [24, "evening"]],
  journey: [[24, "pano"]],
};
export function slotFor(kind: Kind, hour: number): string {
  const m = window.GC_ASSETS?.m?.[kind] ?? {};
  for (const [until, slot] of SLOTS[kind]) if (hour < until && m[slot]) return slot;
  return Object.keys(m)[0] ?? "";
}
const motionOK = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
const url = (p: string) => `${window.GC_ASSETS?.base ?? ""}/assets/${p}`;

export function illo(kind: Kind, hour: number, opts: { size?: "sm" | "lg"; video?: boolean; label?: string; pos?: string } = {}): string {
  const e = window.GC_ASSETS?.m?.[kind]?.[slotFor(kind, hour)];
  if (!e) return `<div class="illo empty"></div>`;
  const src = url(opts.size === "sm" ? e.sm : e.img);
  const vid = opts.video !== false && e.video && motionOK()
    ? `<video class="media" src="${url(e.video)}" poster="${src}" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video>` : "";
  return `<div class="illo ${kind}" style="${opts.pos ? `--pos:${opts.pos}` : ""}"><img class="media still" src="${src}" alt="${opts.label ?? ""}" decoding="async">${vid}<span class="sheen" aria-hidden="true"></span></div>`;
}
// Fade a loop in only once it is actually playing, so there is never a black frame.
export function wireIllo(root: HTMLElement) {
  root.querySelectorAll<HTMLVideoElement>(".illo video").forEach((v) => {
    const on = () => v.parentElement?.classList.add("playing");
    if (!v.paused && v.readyState > 2) on(); else v.addEventListener("playing", on, { once: true });
  });
}

export function assetUrl(kind: string, slot: string, size: "img" | "sm" = "img"): string {
  const e = window.GC_ASSETS?.m?.[kind]?.[slot];
  return e ? url(size === "sm" ? e.sm ?? e.img : e.img) : "";
}

// The whole trip on one painted panorama (night street -> airport at dawn -> city in the morning), with the
// route drawn over it, a marker for each step, and the plane sprite flying the arc. Coordinates are in the
// panorama's own 1600 x 679 space, so the overlay stays glued to the painting at any card width.
export interface JStop { kind: "leave" | "stop" | "airport" | "land" | "goal" }
const POS: Record<JStop["kind"], [number, number]> = { leave: [150, 575], stop: [470, 505], airport: [800, 500], land: [1240, 470], goal: [1320, 540] };
export function panorama(stops: JStop[], opts: { crop?: "card" | "full" } = {}): string {
  const img = assetUrl("journey", "pano");
  const plane = assetUrl("sprite", "plane");
  const vb = opts.crop === "full" ? "0 0 1600 679" : "0 170 1600 509";
  const road = "M 150 575 C 260 560, 380 530, 470 505 S 640 470, 800 500";
  const arc = "M 820 500 C 900 300, 1150 250, 1240 470";
  const move = motionOK();
  const col: Record<JStop["kind"], string> = { leave: "#2F6BE6", stop: "#FFFFFF", airport: "#FFB547", land: "#FFFFFF", goal: "#5FD68E" };
  return `<svg class="pano-svg" viewBox="${vb}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Your trip from home to the meeting">
    <image href="${img}" x="0" y="0" width="1600" height="679" preserveAspectRatio="none" class="pano-img"/>
    <defs><linearGradient id="jshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#050A14" stop-opacity=".7"/><stop offset=".45" stop-color="#050A14" stop-opacity=".15"/><stop offset="1" stop-color="#050A14" stop-opacity="0"/></linearGradient></defs>
    <rect x="0" y="0" width="1600" height="679" fill="url(#jshade)"/>
    <path d="${road}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>
    <path d="${arc}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/>
    <path d="${road}" fill="none" stroke="#FFD27A" stroke-width="5" stroke-linecap="round" class="m-draw" style="--len:720"/>
    <path d="${arc}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" class="m-draw j-arc" style="--len:620"/>
    <g class="j-dot"><circle r="14" fill="#FFD27A" opacity=".35"/><circle r="7" fill="#FFF3C9"/>${move ? `<animateMotion dur="1.4s" begin="0.3s" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".4 0 .2 1" path="${road}"/>` : `<animateMotion dur="0.001s" fill="freeze" path="${road}" keyPoints="1;1" keyTimes="0;1" calcMode="linear"/>`}</g>
    ${plane ? `<g><image href="${plane}" x="-60" y="-16" width="120" height="31"/>${move ? `<animateMotion dur="2.6s" begin="1.4s" fill="freeze" rotate="auto" calcMode="spline" keyPoints="0;.62" keyTimes="0;1" keySplines=".35 0 .15 1" path="${arc}"/>` : `<animateMotion dur="0.001s" fill="freeze" rotate="auto" path="${arc}" keyPoints=".62;.62" keyTimes="0;1" calcMode="linear"/>`}</g>` : ""}
    ${stops.map((s, i) => { const [x, y] = POS[s.kind]; return `<g class="m-pop" style="--d:${200 + i * 120}ms;transform-origin:${x}px ${y}px"><circle cx="${x}" cy="${y}" r="20" fill="${col[s.kind]}" opacity=".28"/><circle cx="${x}" cy="${y}" r="11" fill="${col[s.kind]}" stroke="#0B1522" stroke-width="4"/></g>`; }).join("")}
  </svg>`;
}
