const V = "../illo/";
const S = [
  { t: 0,    d: 4.2, v: "v_home_night.webm", eyebrow: "The night before a work trip", big: `Flight at <b>6:39 <i>AM</i></b>` },
  { t: 4.2,  d: 4.0, v: "v_terminal.webm", eyebrow: "At the airport with time to spare. Or so I thought.", big: `<span id="tick">6:05</span> <i>AM</i>` },
  { t: 8.2,  d: 4.0, v: "v_pushback.webm", eyebrow: "Check-in closed at 6:24 AM", big: `Missed it by <b class="bad">2 minutes</b>` },
  { t: 12.2, d: 4.2, v: "v_air_1755.webm", eyebrow: "Rebooked in a panic, straight from the gate", big: `<b>6:30</b> <span class="pm">PM</span>`, sub: "Not AM. Non-refundable. Money gone." },
  { t: 16.4, d: 4.4, img: "../illo/city_0900c.png", last: true },
];
const root = document.getElementById("root")!;
root.innerHTML = S.map((s, i) => `<section class="shot ${s.last ? "last" : ""}" style="--t:${s.t}s;--d:${s.d}s;z-index:${i + 1}" data-t="${s.t}">
  ${(s as any).img ? `<img class="bg" src="${(s as any).img}">` : `<video src="${V + s.v}" muted playsinline preload="auto"></video>`}<div class="shade"></div>
  ${s.last ? `<div class="brandwrap"><div class="brand"><svg viewBox="0 0 22 24" class="mark"><path d="M3 21V10a8 8 0 0 1 16 0v11" fill="none" stroke="#FFB547" stroke-width="2.6" stroke-linecap="round"/><circle cx="11" cy="15" r="2.8" fill="#FFB547"/></svg><div><div class="name">GateCue</div><div class="tag">An Alexa+ travel co-pilot that checks the clock before you pay.</div></div></div></div>`
  : `<div class="copy"><div class="eyebrow">${s.eyebrow}</div><div class="big">${s.big}</div>${s.sub ? `<div class="sub">${s.sub}</div>` : ""}</div>`}
</section>`).join("");
const tick = document.getElementById("tick")!;
function clockAt(e: number) { if (e > 4.2 && e < 8.2) { const m = Math.min(26, 5 + Math.floor(Math.max(0, e - 4.5) / 3.3 * 21)); tick.textContent = `6:${String(m).padStart(2, "0")}`; tick.classList.toggle("late", m >= 24); } }
const vids = [...document.querySelectorAll<HTMLVideoElement>("video")];
(window as any).ready = () => Promise.all(vids.map((v) => v.readyState >= 2 ? 0 : new Promise((r) => v.addEventListener("loadeddata", r, { once: true }))));
(window as any).seek = async (t: number) => {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = t * 1000; }
  clockAt(t);
  await Promise.all(vids.map((v) => {
    const st = Number(v.parentElement!.dataset.t); const local = Math.max(0, t - st);
    const target = v.duration ? local % (v.duration - 0.05) : 0;
    if (Math.abs(v.currentTime - target) < 0.001) return 0;
    return new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.currentTime = target; });
  }));
};
