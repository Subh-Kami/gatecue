import { startCard, esc } from "./shared/base.js";
import { attribution, icon, bigTime, hourFromDisplay, flipText } from "./shared/art.js";
import { illo, wireIllo } from "./shared/illo.js";

type Conf =
  | { kind: "ride"; status: string; pickupDisplay: string; pickupDay?: string; pickup?: string; stop?: string; dropoff?: string; link?: string; scheduleAhead?: boolean }
  | { kind: "flight"; status: string; confirmation?: string; flightNumber: string; from?: string; to?: string; departureDisplay: string; arrivalDisplay?: string; departureDay: string; fareUsd: number };

const root = document.getElementById("root")!;
const CHECK = `<svg class="chk" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" class="m-pop"/><path d="M15 27l7 7 15-16" class="m-draw" style="--len:40"/></svg>`;

function render(c: Conf, app?: any) {
  if (c.status !== "booked" && c.status !== "handed_off") {
    root.innerHTML = `${attribution()}<section class="gc-root m-in plain"><span class="gc-status">${icon.clock}Nothing was booked.</span></section>`;
    return;
  }
  if (c.kind === "ride") {
    // Handoff: the ride app is open with the trip filled in; the traveller requests (or schedules) and pays there.
    root.innerHTML = `${attribution()}
      <section class="gc-root conf m-in">
        <div class="banner">${illo("home", hourFromDisplay(c.pickupDisplay), { pos: "60% 72%" })}
          <div class="on"><span class="handoff">${icon.arrow}</span><div><div class="ok-l">${c.scheduleAhead ? "Schedule your ride for" : "Request your ride now"}</div><div class="big">${bigTime(c.pickupDisplay)}</div><div class="sub">Pickup ${esc(c.pickupDay ?? "")}</div></div></div>
        </div>
        <ol class="path">
          <li class="m-in" style="--i:1"><span class="pt"></span>${esc(c.pickup ?? "Home")}</li>
          ${c.stop ? `<li class="m-in" style="--i:2"><span class="pt"></span>Add a stop: ${esc(c.stop)}</li>` : ""}
          <li class="m-in" style="--i:3"><span class="pt end"></span>${esc(c.dropoff ?? "Airport")}</li>
        </ol>
        <div class="foot">${icon.card}<span>You'll see the price and pay in your ride app.</span>${c.link ? `<button class="gc-btn primary open">Open ride app</button>` : ""}</div>
      </section>`;
    root.querySelector(".open")?.addEventListener("click", () => app?.openLink({ url: c.link }));
    wireIllo(root);
    return;
  }
  root.innerHTML = `${attribution()}
    <section class="gc-root conf pass m-in">
      <div class="banner">${illo("city", hourFromDisplay(c.arrivalDisplay ?? c.departureDisplay), { pos: "50% 62%" })}
        <div class="on">${CHECK}<div><div class="ok-l">You're booked</div><div class="sub">${esc(c.departureDay)}</div></div></div>
      </div>
      <div class="board gc-num">
        <div><span class="code">${flipText(c.from ?? "", 4)}</span><span class="t">${esc(c.departureDisplay)}</span></div>
        <div class="mid">${icon.plane}<span>${esc(c.flightNumber)}</span></div>
        <div class="r"><span class="code">${flipText(c.to ?? "", 8)}</span><span class="t">${esc(c.arrivalDisplay ?? "")}</span></div>
      </div>
      <div class="tear" aria-hidden="true"></div>
      <div class="foot gc-num"><span>Confirmation <strong class="pnr">${flipText(c.confirmation ?? "", 12)}</strong></span><span>$${c.fareUsd.toFixed(2)} paid</span></div>
    </section>`;
  wireIllo(root);
}

startCard<Conf>("confirm", render);
