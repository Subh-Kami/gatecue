// Simulator motion: the GateCue mark opening onto the home screen, the clock handing off on wake,
// the thinking cue, and reply typography that marks every time with its AM or PM.
// Every sequence ends on a static frame and is skipped entirely under prefers-reduced-motion.
export const motionOK = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// ---- Reply typography -----------------------------------------------------------------------------
// Words arrive in reading order. Times get a tabular face and an AM (sunrise gold) or PM (dusk violet) tag;
// "this evening" / "tomorrow morning" get a matching underline. textContent stays exactly the spoken text.
const TOKEN = /(\b\d{1,2}(?::\d{2})?\s?(?:AM|PM)\b|\b(?:this (?:morning|afternoon|evening)|tomorrow (?:morning|afternoon|evening)|tonight)\b)/gi;
export function sayHTML(text: string): string {
  let i = 0, out = "";
  for (const [n, part] of text.split(TOKEN).entries()) {
    if (!part) continue;
    if (n % 2 === 1) {
      const t = /^(.*?)(\s?)(AM|PM)$/i.exec(part);
      if (t) {
        const ap = t[3].toLowerCase();
        out += `<span class="w tm" style="--w:${i++}">${esc(t[1])}${t[2]}<span class="ap ${ap}">${esc(t[3])}</span></span>`;
      } else {
        const ap = /morning/i.test(part) ? "am" : "pm";
        out += `<span class="w dp ${ap}" style="--w:${i++}">${esc(part)}</span>`;
      }
      continue;
    }
    for (const bit of part.split(/(\s+)/)) out += /^\s+$/.test(bit) || !bit ? bit : `<span class="w" style="--w:${i++}">${esc(bit)}</span>`;
  }
  return out;
}
export const sayP = (text: string, cls = "") => `<p class="say-text ${cls}">${sayHTML(text)}</p>`;

// ---- Thinking cue: the GateCue dot running the arch of the gate --------------------------------------
const ARCH = "M6 42V20a16 16 0 0 1 32 0v22";
export const THINKING = `<div class="thinking cue" role="status" aria-label="Alexa is thinking"><svg viewBox="0 0 44 46" aria-hidden="true">
  <path d="${ARCH}" class="cue-track"/><path d="${ARCH}" class="cue-comet" pathLength="100"/>
  <circle r="4.2" class="cue-dot"><animateMotion dur="1.5s" repeatCount="indefinite" calcMode="spline" keyPoints="0;1;0" keyTimes="0;.5;1" keySplines=".45 0 .55 1;.45 0 .55 1" path="${ARCH}"/></circle></svg></div>`;

// ---- Opening: the mark draws, the dot lands, and the gate opens onto the home screen ------------------
export function intro(screen: HTMLElement, ambient: HTMLElement): Promise<void> {
  return new Promise((done) => {
    if (!motionOK()) return done();
    const el = document.createElement("div");
    el.className = "intro";
    el.innerHTML = `<svg class="intro-mark" viewBox="0 0 22 24" aria-hidden="true"><path class="arch" d="M3 21V10a8 8 0 0 1 16 0v11" pathLength="1"/><circle class="dot" cx="11" cy="15" r="2.8"/></svg>
      <div class="intro-word" aria-label="GateCue">${[..."GateCue"].map((c, k) => `<span style="--k:${k}">${c}</span>`).join("")}</div>
      <div class="intro-tag">Get there for what matters.</div>`;
    screen.appendChild(el);
    document.body.classList.add("intro-on");
    let finished = false;
    const finish = () => {
      if (finished) return; finished = true;
      ambient.style.clipPath = ""; ambient.style.zIndex = ""; ambient.style.transform = "";
      document.body.classList.remove("intro-on");
      el.remove(); done();
    };
    el.addEventListener("click", finish);
    setTimeout(() => {
      if (finished) return;
      // Gate inner edge, from the mark's viewBox (stroke 2.6 around x 3..19, arc top y 2), in screen pixels.
      const mark = el.querySelector("svg")!.getBoundingClientRect();
      const sr = screen.getBoundingClientRect();
      const z = sr.width / screen.offsetWidth || 1;
      const k = mark.width / 22 / z;
      const ox = (mark.left - sr.left) / z, oy = (mark.top - sr.top) / z;
      const W = screen.offsetWidth, H = screen.offsetHeight;
      const top = oy + 3.3 * k, left = ox + 4.3 * k, right = W - (ox + 17.7 * k), bottom = H - (oy + 21 * k), r = 6.7 * k;
      ambient.style.zIndex = "9";
      document.body.classList.remove("intro-on"); // home-screen cards float in as the gate opens
      const big = Math.max(W, H) * 1.2;
      const a = ambient.animate([
        { clipPath: `inset(${top}px ${right}px ${bottom}px ${left}px round ${r}px ${r}px 0 0)`, transform: "scale(1.14)" },
        { clipPath: `inset(${-big * 0.2}px ${-big * 0.2}px ${-big * 0.2}px ${-big * 0.2}px round ${big}px ${big}px 0 0)`, transform: "scale(1)" },
      ], { duration: 1050, easing: "cubic-bezier(.7,0,.2,1)", fill: "forwards" });
      a.onfinish = () => { a.cancel(); finish(); };
    }, 1450);
    setTimeout(finish, 4000); // never block the device
  });
}

// ---- Wake: the home-screen clock flies up into the status bar as the conversation sheet rises -------
export function handOffClock(screen: HTMLElement) {
  if (!motionOK()) return;
  const from = screen.querySelector<HTMLElement>("#ambTime"), to = screen.querySelector<HTMLElement>("#clock");
  if (!from || !to || to.offsetParent === null || from.offsetParent === null) return;
  const sr = screen.getBoundingClientRect();
  const z = sr.width / screen.offsetWidth || 1;
  const fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.removeAttribute("id");
  ghost.classList.add("clock-ghost");
  Object.assign(ghost.style, { animation: "none", left: `${(fr.left - sr.left) / z}px`, top: `${(fr.top - sr.top) / z}px`, transformOrigin: "0 0" });
  screen.appendChild(ghost);
  const s = parseFloat(getComputedStyle(to).fontSize) / parseFloat(getComputedStyle(from).fontSize);
  const dx = (tr.left - fr.left) / z, dy = (tr.top - fr.top) / z + (tr.height / z - (fr.height / z) * s) / 2;
  from.style.visibility = "hidden";
  to.style.opacity = "0";
  const a = ghost.animate([
    { transform: "translate(0,0) scale(1)", textShadow: "0 4px 40px rgba(0,0,0,.35)" },
    { transform: `translate(${dx}px,${dy}px) scale(${s})`, textShadow: "0 0 0 rgba(0,0,0,0)" },
  ], { duration: 760, easing: "cubic-bezier(.65,0,.2,1)", fill: "forwards" });
  // Hand over to the real status-bar clock just before the ghost settles, so there is no visible swap.
  setTimeout(() => {
    to.style.opacity = "";
    to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: "forwards" });
  }, 600);
  a.onfinish = () => { ghost.remove(); from.style.visibility = ""; };
}

// ---- Home-screen glance: the next trip GateCue remembers --------------------------------------------
export function tripGlance(t: { flight: { number: string; from: string; to: string }; departureDisplay: string; goalDay: string; goalDisplay: string; goalPlace: string }): string {
  const d = "M 8 34 Q 80 -6 152 34";
  return `<span class="amb-k">Next trip</span>
    <div class="amb-route" aria-hidden="true"><b>${esc(t.flight.from)}</b>
      <svg viewBox="0 0 160 40"><path d="${d}" class="g-track"/><path d="${d}" class="g-line" pathLength="1"/>
        <g class="g-plane"><path d="M-7 -1 L6 -1 L9 0 L6 1 L-7 1 Z M-2 -1 L-5 -6 L-2 -6 L3 -1 Z M-2 1 L-5 6 L-2 6 L3 1 Z M-7 -1 L-9 -4 L-7 -4 L-5 -1 Z M-7 1 L-9 4 L-7 4 L-5 1 Z"/>
          <animateMotion dur="2.4s" begin="indefinite" fill="freeze" rotate="auto" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".4 0 .2 1" path="${d}"/></g></svg>
      <b>${esc(t.flight.to)}</b></div>
    <span class="amb-v">${sayHTML(`${t.flight.number}, ${t.goalDay.split(",")[0]} ${t.departureDisplay}`)}</span>
    <span class="amb-s">${sayHTML(`${t.goalPlace} at ${t.goalDisplay.replace(":00 ", " ")}`)}</span>`;
}
