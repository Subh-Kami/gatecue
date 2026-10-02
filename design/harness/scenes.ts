import { airfield, home, cafe, city, journey } from "../../views/shared/scene.js";
const hours = [0, 5.5, 6.5, 8.5, 12, 17, 18.8, 20, 22.5];
const fmt = (h: number) => { const H = Math.floor(h), M = Math.round((h - H) * 60); const ap = H < 12 ? "AM" : "PM"; return `${((H + 11) % 12) + 1}:${String(M).padStart(2, "0")} ${ap}`; };
let html = "";
for (const [name, fn] of [["airfield", airfield], ["home", home], ["cafe", cafe], ["city", city]] as const) {
  html += `<h2>${name}</h2><div class="row">` + hours.map((h) => `<figure><div class="tile">${(fn as any)(h, { scrim: 0 })}</div><figcaption>${fmt(h)}</figcaption></figure>`).join("") + "</div>";
}
html += `<h2>journey</h2><div class="wide">${journey(false, 4.9, 8.8, [{ x: 40, kind: "leave" }, { x: 250, kind: "stop" }, { x: 470, kind: "airport" }, { x: 850, kind: "land" }, { x: 912, kind: "goal" }])}</div>`;
html += `<div class="wide">${journey(false, 16.5, 20.3, [{ x: 40, kind: "leave" }, { x: 470, kind: "airport" }, { x: 850, kind: "land" }])}</div>`;
document.body.innerHTML = html;
