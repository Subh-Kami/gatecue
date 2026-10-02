import { home, cafe, airfield, city } from "../../views/shared/scene.js";
// A 18-second cold open for the demo video, drawn with the same scene kit as the cards.
const S = [
  { t: 0,    dur: 3.8, scene: home(21.8, { scrim: .5, align: "xMidYMax" }), eyebrow: "The night before a work trip", big: `Flight at <b>6:39 <i>AM</i></b>` },
  { t: 3.8,  dur: 3.8, scene: cafe(6.05, { scrim: .5, align: "xMidYMax" }), eyebrow: "At the airport, with time to spare. Or so I thought.", big: `<span id="tick">6:05</span> <i>AM</i>` },
  { t: 7.6,  dur: 3.6, scene: airfield(6.5, { scrim: .5, plane: "taxi" }), eyebrow: "Check-in closed at 6:24 AM", big: `Missed it by <b class="bad">2 minutes</b>` },
  { t: 11.2, dur: 3.8, scene: airfield(18.6, { scrim: .5, plane: "taxi" }), eyebrow: "Rebooked in a panic, straight from the gate", big: `<b>6:30</b> <span class="pm">PM</span>`, sub: "Not AM. Non-refundable. Money gone." },
  { t: 15,   dur: 4.2, scene: city(8.4, { scrim: 0, align: "xMidYMax" }), title: true },
];
const root = document.getElementById("root")!;
root.innerHTML = S.map((s, i) => `<section class="shot ${s.title ? "title" : ""}" style="--t:${s.t}s;--d:${s.dur}s;z-index:${i + 1}">
  <div class="bg">${s.scene}</div>
  ${s.title ? `<div class="brandwrap"><div class="brand"><svg viewBox="0 0 22 24" class="mark"><path d="M3 21V10a8 8 0 0 1 16 0v11" fill="none" stroke="#FFB547" stroke-width="2.6" stroke-linecap="round"/><circle cx="11" cy="15" r="2.8" fill="#FFB547"/></svg><div><div class="name">GateCue</div><div class="tag">An Alexa+ travel co-pilot that checks the clock before you pay.</div></div></div></div>`
  : `<div class="copy"><div class="eyebrow">${s.eyebrow}</div><div class="big">${s.big}</div>${s.sub ? `<div class="sub">${s.sub}</div>` : ""}</div>`}
</section>`).join("");
// Deterministic playback for recording: window.seek(t) freezes every animation at t seconds.
const tick = document.getElementById("tick")!;
function clockAt(e: number) { if (e > 3.8 && e < 7.6) { const m = Math.min(26, 5 + Math.floor(Math.max(0, e - 4.1) / 3.2 * 21)); tick.textContent = `6:${String(m).padStart(2, "0")}`; tick.classList.toggle("late", m >= 24); } }
(window as any).seek = (t: number) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; } clockAt(t); };
if (!location.hash.includes("rec")) { const start = performance.now(); const run = () => { clockAt((performance.now() - start) / 1000); requestAnimationFrame(run); }; requestAnimationFrame(run); }
