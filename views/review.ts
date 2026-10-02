import { startCard, esc, mins, wireSay, cap, TZ } from "./shared/base.js";
import { attribution, icon, bigTime, localHour } from "./shared/art.js";
import { illo, wireIllo } from "./shared/illo.js";

interface Review {
  quoteId: string; airline: string;
  flight: { number: string; from: string; to: string; departure: string; arrival: string };
  check: { departureDisplay: string; departureDay: string; departureDaySpoken: string; departsIn: string; arrivalDisplay: string; makesGoal: boolean; marginMinutes: number; warning?: string };
  goalDisplay: string; goalPlace: string; atVenueDisplay: string; fareUsd: number; refundable: boolean;
}

const root = document.getElementById("root")!;

// Inline card kept to about 250 base px tall so reply, card and chips fit one Echo Show screen.
// The picture is the departure hour itself: an evening sky for a PM flight, before any digit is read.
function render(r: Review, app: any) {
  const ok = r.check.makesGoal;
  root.innerHTML = `
    ${attribution("GateCue, check before you pay")}
    <section class="gc-root split m-in ${ok ? "" : "miss"}">
      <div class="pic">
        ${illo("airfield", localHour(r.flight.departure, TZ), { pos: "68% 50%", label: `${cap(r.check.departureDaySpoken)} at the airport` })}
        <div class="on-pic">
          <div class="when">${esc(cap(r.check.departureDaySpoken))}</div>
          ${bigTime(r.check.departureDisplay, "hero")}
          <div class="rel">${esc(r.check.departureDay)}, ${esc(r.check.departsIn)}</div>
        </div>
      </div>
      <div class="info">
        <div class="verdict ${ok ? "ok" : "bad"} m-in" style="--i:1">${ok ? icon.checkCircle : icon.alert}<span>${ok ? `Gets you there ${mins(r.check.marginMinutes)} early` : `Lands ${esc(r.check.arrivalDisplay)}, after your ${esc(r.goalDisplay.replace(":00 ", " "))} meeting`}</span></div>
        <div class="title">${esc(r.flight.from)} <span class="arr">${icon.arrow}</span> ${esc(r.flight.to)} <span class="fn">${esc(r.airline)} ${esc(r.flight.number)}</span></div>
        <dl class="rows">
          <div class="m-fade" style="--i:2"><dt>${icon.pin}You reach ${esc(r.goalPlace)}</dt><dd class="gc-num ${ok ? "ok" : "bad"}">${esc(r.atVenueDisplay)}</dd></div>
          <div class="m-fade" style="--i:3"><dt>${r.refundable ? icon.refund : icon.noRefund}<span class="${r.refundable ? "" : "badt"}">${r.refundable ? "Refundable" : "Non-refundable, no money back"}</span></dt><dd class="gc-num total">$${r.fareUsd.toFixed(2)}</dd></div>
        </dl>
        <div class="actions">
          ${ok
            ? `<button class="gc-btn" data-say="Show me other flights">Other flights</button><button class="gc-btn primary" data-say="Book it">Book for $${r.fareUsd}</button>`
            : `<button class="gc-btn" data-say="Book it anyway">${icon.alert}Book anyway</button><button class="gc-btn primary" data-say="Show me flights that make my meeting">Flights that make it</button>`}
        </div>
      </div>
    </section>`;
  wireSay(root, app);
  wireIllo(root);
}

startCard<Review>("review", render);
