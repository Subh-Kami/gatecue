import { startCard, esc, TZ } from "./shared/base.js";
import { attribution, icon, localHour } from "./shared/art.js";
import { illo, wireIllo } from "./shared/illo.js";

interface Nudge { kind: "nudge"; closesAt: string; serverNow: string; walkMinutes: number; closesDisplay: string; speedup: number }

const root = document.getElementById("root")!;
let timer: number | undefined;

// Proactive nudge: the ring drains in real time (following the server's demo clock), over the gate view
// at the current hour. Under the walk time it turns red and the strip says to go.
function render(n: Nudge) {
  const speed = n.speedup || 1;
  const t0 = Date.now();
  const nowMs = () => new Date(n.serverNow).getTime() + (Date.now() - t0) * speed;
  const total = 45; // minutes on the ring = the airline's check-in window
  root.innerHTML = `
    ${attribution()}
    <section class="gc-root nudge m-in">
      <div class="visual">
        ${illo("terminal", localHour(n.serverNow, TZ), { pos: "30% 70%" })}
        <div class="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="track"/><circle cx="60" cy="60" r="52" class="bar" pathLength="100"/></svg>
          <div class="mid gc-num"><span class="n">--</span><span class="u">min</span></div>
        </div>
      </div>
      <div class="txt">
        <div class="h">Check-in closes in <span class="n2 gc-num">--</span> <span class="pl">minutes</span></div>
        <div class="s">The counter closes at ${esc(n.closesDisplay)}. Leave the food court now.</div>
        <div class="strip m-in" style="--i:2">${icon.walk}<span><strong>${n.walkMinutes}-minute walk</strong> to the check-in counter</span><span class="go">Leave now</span></div>
      </div>
    </section>`;
  wireIllo(root);
  const bar = root.querySelector<SVGCircleElement>(".bar")!;
  const nEl = root.querySelector<HTMLElement>(".n")!, n2 = root.querySelector(".n2")!;
  const card = root.querySelector<HTMLElement>(".nudge")!;
  let prev = -1;
  const tick = () => {
    const left = Math.max(0, (new Date(n.closesAt).getTime() - nowMs()) / 60000);
    const shown = Math.ceil(left);
    if (shown !== prev) {
      nEl.textContent = String(shown); n2.textContent = String(shown);
      root.querySelector(".pl")!.textContent = shown === 1 ? "minute" : "minutes";
      // Each new minute flips in, like a departure board.
      if (prev !== -1) { nEl.classList.remove("flip"); void nEl.offsetWidth; nEl.classList.add("flip"); }
      prev = shown;
    }
    bar.style.strokeDashoffset = String(100 - Math.min(100, (left / total) * 100));
    // Urgency is a colour, not just a number: calm cyan with time in hand, amber as the walk gets close, red when it's go time.
    card.style.setProperty("--rc", urgency(left, n.walkMinutes));
    card.classList.toggle("late", left <= n.walkMinutes);
  };
  // The ring draws in from empty to the time left, then drains live.
  bar.style.strokeDashoffset = "100";
  requestAnimationFrame(() => requestAnimationFrame(tick));
  if (timer) clearInterval(timer);
  timer = window.setInterval(tick, 1000);
}

// Calm cyan with plenty of time; from 20 minutes before the walk it's amber, warming through orange to red
// as the margin goes (mixed in OKLab so it never passes through a reassuring green); red once it's go time.
function urgency(left: number, walk: number): string {
  if (left >= walk + 20) return "#5AC8FA";
  if (left <= walk) return "#FF6B5B";
  const t = (left - walk) / 20;
  return `color-mix(in oklab, #FFB547 ${(t * 100).toFixed(0)}%, #FF6B5B)`;
}

startCard<Nudge>("countdown", render);
