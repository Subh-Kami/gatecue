import { startCard, esc, mins, say, TZ } from "./shared/base.js";
import { attribution, icon, bigTime, localHour } from "./shared/art.js";
import { illo, wireIllo } from "./shared/illo.js";

interface Opt {
  id: string; airline: string;
  flight: { number: string; from: string; to: string; departure: string; arrival: string };
  check: { departureDisplay: string; arrivalDisplay: string; departureDaySpoken: string; makesGoal: boolean; marginMinutes: number };
  fareUsd: number; refundable: boolean; durationMinutes: number;
}
interface Data { headline: string; goalDisplay: string; options: Opt[]; hiddenCount: number }

const root = document.getElementById("root")!;

// Alexa+ carousel: 3-5 items inline, strongest first, the whole card is the tap target (same as saying "Review ...").
// Each tile's sky is drawn for its own departure hour, so an evening flight looks like an evening flight.
function render(d: Data, app: any) {
  root.innerHTML = `
    ${attribution()}
    <ul class="row" role="list" aria-label="${esc(d.headline)}">${d.options.map((o, i) => {
      const ok = o.check.makesGoal;
      const utter = `Review ${o.flight.number} at ${o.check.departureDisplay}`;
      return `<li class="tile-in" style="--i:${i}"><button class="item gc-root ${ok ? "ok" : "miss"}" data-say="${esc(utter)}" aria-label="${esc(utter)}">
        <span class="pic">${illo("airfield", localHour(o.flight.departure, TZ), { size: "sm", video: false, pos: "62% 50%" })}
          <span class="on-pic">${bigTime(o.check.departureDisplay)}<small>${esc(o.check.departureDaySpoken)}</small></span>
          ${ok ? "" : `<span class="flag">${icon.alert}</span>`}
        </span>
        <span class="gc-status ${ok ? "ok" : "bad"}">${ok ? icon.checkCircle : icon.alert}${ok ? `${mins(o.check.marginMinutes)} spare` : "Misses meeting"}</span>
        <span class="leg gc-num">${esc(o.flight.number)} · lands ${esc(o.check.arrivalDisplay)}</span>
        <span class="meta"><span class="price gc-num">$${o.fareUsd}</span>${o.refundable ? " · refundable" : ""}</span>
      </button></li>`;
    }).join("")}</ul>`;
  wireIllo(root);
  root.querySelectorAll<HTMLButtonElement>("button[data-say]").forEach((b) => b.addEventListener("click", () => say(app, b.dataset.say!)));
}

startCard<Data>("flights", render);
