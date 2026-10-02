import { journey, airfield } from "../../views/shared/scene.js";
const W = Number(new URLSearchParams(location.search).get("w") ?? 1600);
document.getElementById("bg")!.innerHTML = journey(false, 5.2, 9, [{ x: 40, kind: "leave" }, { x: 250, kind: "stop" }, { x: 470, kind: "airport" }, { x: 850, kind: "land" }, { x: 912, kind: "goal" }]);
document.getElementById("mini")!.innerHTML = airfield(17.9, { compact: true, scrim: .6 });
document.body.dataset.w = String(W);
