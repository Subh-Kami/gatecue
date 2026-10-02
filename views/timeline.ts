import { startCard, esc, mins, cap, TZ } from "./shared/base.js";
import { attribution, icon, bigTime } from "./shared/art.js";
import { panorama, type JStop } from "./shared/illo.js";
import { camera, countUp } from "./shared/motion.js";

interface Step { id: string; label: string; at: string; display: string; note?: string }
interface Plan { summary: string; feasible: boolean; slackMinutes: number; steps: Step[]; goalPlace: string; goalDisplay: string; flightNumber?: string; from?: string; to?: string; leaveWhen?: string }

const root = document.getElementById("root")!;
// The five moments that matter, in the order they happen; colors match the markers on the panorama.
const KEY: Record<string, { label: (p: Plan) => string; icon: string; tone: string }> = {
  leave: { label: () => "Leave home", icon: icon.car, tone: "leave" },
  cutoff: { label: () => "Check-in closes", icon: icon.clock, tone: "cutoff" },
  depart: { label: (p) => `${p.flightNumber ?? "Flight"} takes off`, icon: icon.plane, tone: "" },
  land: { label: (p) => `Land at ${p.to ?? ""}`, icon: icon.pin, tone: "" },
  goal: { label: () => "Meeting starts", icon: icon.checkCircle, tone: "goal" },
};

// The camera move plays once per plan; re-renders (theme or device changes) land straight on the final frame.
const shown = new Set<string>();
const key = (p: Plan) => p.steps.map((s) => s.at).join("|");

function render(p: Plan, app: any) {
  const full = document.body.dataset.display === "fullscreen";
  const at = (id: string) => p.steps.find((s) => s.id === id);
  const leave = at("leave")!;
  const hasStop = !!leave.note;
  const stops: JStop[] = [{ kind: "leave" }, ...(hasStop ? [{ kind: "stop" as const }] : []), { kind: "airport" }, { kind: "land" }, { kind: "goal" }];
  const slack = Math.abs(Math.round(p.slackMinutes));
  const amount = slack < 90 ? `<span class="gc-num" data-count="${slack}">${slack}</span> min` : esc(mins(slack));
  const status = p.feasible
    ? `<span class="pill ok">${icon.checkCircle}${amount} to spare</span>`
    : `<span class="pill bad">${icon.alert}${amount} late</span>`;
  const steps = full ? p.steps : p.steps.filter((s) => KEY[s.id]);
  root.innerHTML = `
    ${attribution()}
    <section class="gc-root card m-in">
      <div class="pano">
        ${panorama(stops, { crop: full ? "full" : "card" })}
        <div class="over">
          <div class="eyebrow">${p.leaveWhen ? `${esc(cap(p.leaveWhen))}, leave home at` : "Leave home at"}</div>
          <div class="time">${bigTime(leave.display)}</div>
          ${status}
        </div>
        ${full ? "" : `<button class="gc-btn more" aria-label="See every step full screen">${icon.expand}</button>`}
      </div>
      <ol class="steps ${full ? "all" : ""}">
        ${steps.map((s, i) => `<li class="m-in ${esc(KEY[s.id]?.tone ?? "")}" style="--i:${i + 2}">
          <span class="dot">${KEY[s.id]?.icon ?? icon.clock}</span>
          <span class="t gc-num">${esc(s.display)}</span>
          <span class="l">${esc(KEY[s.id]?.label(p) ?? s.label)}</span>
          ${full && s.note ? `<span class="n">${esc(s.note)}</span>` : ""}
        </li>`).join("")}
      </ol>
    </section>`;
  root.querySelector(".more")?.addEventListener("click", () => app.requestDisplayMode({ mode: "fullscreen" }));
  // Camera: start close on the front door, travel down the road with the dot, then pull back to the whole day.
  const svg = root.querySelector<SVGSVGElement>(".pano-svg");
  if (svg && !full && !shown.has(key(p))) camera(svg, [40, 400, 600, 191], [380, 330, 820, 261], [0, 170, 1600, 509], 2300, 120);
  countUp(root, 1000, 900);
  shown.add(key(p));
}

startCard<Plan>("timeline", render);
