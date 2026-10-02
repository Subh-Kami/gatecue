// GateCue, 15-second reel. 120 BPM: one beat = 0.5 s, one bar = 2 s. Every cut lands on a beat.
// render(t) is pure: the recorder seeks frame by frame, so timing is exact at any frame rate.
const A = "a/";
const BEAT = 0.5;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const outExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const inExpo = (x: number) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10));
const outCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const inOutCubic = (x: number) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x: number) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const outBounce = (x: number) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + .75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + .9375; return n * (x -= 2.625 / d) * x + .984375; };
const rnd = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const shake = (t: number, t0: number, amp: number, dur = .28) => { const k = seg(t, t0, t0 + dur); if (k <= 0 || k >= 1) return [0, 0]; const a = amp * (1 - k) * (1 - k); const f = Math.floor(t * 60); return [(rnd(f) - .5) * 2 * a, (rnd(f + 99) - .5) * 2 * a]; };

const MARK = (stroke = "#FFB547") => `<svg viewBox="0 0 22 24" width="100%" height="100%" style="overflow:visible"><path class="arch" d="M3 21V10a8 8 0 0 1 16 0v11" fill="none" stroke="${stroke}" stroke-width="2.6" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/><circle class="dot" cx="11" cy="15" r="2.8" fill="${stroke}"/></svg>`;

const SKIES = [
  { img: "airfield-night", t: "4:00", ap: "AM" }, { img: "airfield-predawn", t: "5:55", ap: "AM" }, { img: "airfield-morning", t: "7:30", ap: "AM" },
  { img: "airfield-day", t: "12:00", ap: "PM" }, { img: "airfield-golden", t: "5:55", ap: "PM" }, { img: "airfield-dusk", t: "7:45", ap: "PM" },
];
const SCREENS = [
  { img: "01-plan", verb: "PLAN", sub: "Leave-home time, ride and food stop, planned backwards from the flight." },
  { img: "05-options", verb: "COMPARE", sub: "Real flights, ranked by whether they make your meeting." },
  { img: "07-pm-trap", verb: "CATCH", sub: "5:55 PM, not AM. Flagged before you pay." },
  { img: "04-nudge", verb: "NUDGE", sub: "Check-in closes in 21 minutes. Leave the food court now." },
  { img: "03-ride-booked", verb: "BOOK", sub: "Ride and flight booked in the conversation." },
];
// Panorama stops, in the 3800 x 1612 image (scaled from the 1600-wide art grid).
const K = 3800 / 1600;
const STOPS = [
  { x: 150, y: 575, t: 8.5, c: "#2F6BE6", time: "4:59 AM", what: "Leave home" },
  { x: 470, y: 505, t: 9.0, c: "#FFFFFF", time: "5:12 AM", what: "Food stop" },
  { x: 800, y: 500, t: 9.5, c: "#FFB547", time: "5:54 AM", what: "Check-in closes" },
  { x: 1240, y: 470, t: 10.5, c: "#FFFFFF", time: "8:49 AM", what: "Land" },
  { x: 1320, y: 540, t: 11.0, c: "#5FD68E", time: "11:00 AM", what: "Meeting" },
].map((s) => ({ ...s, x: s.x * K, y: s.y * K }));
const ROAD = `M ${150 * K} ${575 * K} C ${260 * K} ${560 * K}, ${380 * K} ${530 * K}, ${470 * K} ${505 * K} S ${640 * K} ${470 * K}, ${800 * K} ${500 * K}`;
const ARC = `M ${820 * K} ${500 * K} C ${900 * K} ${300 * K}, ${1150 * K} ${250 * K}, ${1240 * K} ${470 * K}`;

const root = document.getElementById("root")!;
root.innerHTML = `
<section class="L" id="A">
  <div class="bg fill"><img class="cover" id="a1" src="${A}airfield-predawn.jpg"><img class="cover" id="a2" src="${A}airfield-golden.jpg" style="opacity:0"></div>
  <div class="dim"></div>
  <div class="center" id="aClockWrap"><div class="clock" id="aClock"><span id="aNum">5:55</span><span class="pill" id="aPill">AM</span></div></div>
  <div class="ghost" id="aR" style="opacity:0;color:#ff2d55"><div class="clock"><span>5:55</span><span class="pill pm" style="background:#ff2d55">PM</span></div></div>
  <div class="ghost" id="aC" style="opacity:0;color:#00e5ff"><div class="clock"><span>5:55</span><span class="pill pm" style="background:#00e5ff">PM</span></div></div>
  <div class="cap" id="aCap">Same digits. Wrong half of the day.</div>
</section>
<section class="L" id="B">
  <div class="fill" id="bBg"></div>
  <div class="stripe" id="bS1"></div><div class="stripe" id="bS2"></div>
  <div class="word" id="bW"></div>
</section>
<section class="L" id="C">
  <svg class="fill" viewBox="0 0 1920 1080" id="cSvg">
    <defs>${SKIES.map((s, i) => `<clipPath id="cc${i}"><circle id="ccc${i}" cx="960" cy="540" r="0"/></clipPath>`).join("")}</defs>
    <circle id="cRingT" cx="960" cy="560" r="230" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="26"/>
    <circle id="cRing" cx="960" cy="560" r="230" fill="none" stroke="#FFB547" stroke-width="26" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100" transform="rotate(-90 960 560)"/>
    ${SKIES.map((s, i) => `<g clip-path="url(#cc${i})"><image href="${A}${s.img}.jpg" x="-80" y="-120" width="2080" height="1554" preserveAspectRatio="xMidYMid slice"/></g><circle id="cdot${i}" cx="960" cy="540" r="0" fill="none" stroke="#fff" stroke-width="4"/>`).join("")}
  </svg>
  <div id="cMark" style="position:absolute;left:760px;top:300px;width:400px;height:436px">${MARK()}</div>
  <div id="cNum" style="position:absolute;left:0;right:0;top:470px;text-align:center;font-weight:900;font-size:170px;line-height:1;font-variant-numeric:tabular-nums;opacity:0">45</div>
</section>
<section class="L" id="D">
  ${SKIES.map((s, i) => `<div class="fill" id="d${i}" style="clip-path:circle(0% at 50% 50%)"><img class="cover" src="${A}${s.img}.jpg" id="di${i}"></div>`).join("")}
  <div class="fill" style="background:linear-gradient(0deg,rgba(4,8,16,.7),rgba(4,8,16,0) 45%),linear-gradient(180deg,rgba(4,8,16,.55),rgba(4,8,16,0) 30%)"></div>
  <div class="label" id="dLabel">Same airport. Six different skies.</div>
  <div class="clock2" id="dClock">4:00<small>AM</small></div>
</section>
<section class="L" id="E">
  <div id="cam"><img src="${A}pano.jpg" style="position:absolute;left:0;top:0;width:3800px;height:1612px">
    <svg style="position:absolute;left:0;top:0" width="3800" height="1612" viewBox="0 0 3800 1612">
      <path d="${ROAD}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="7" stroke-dasharray="3 22" stroke-linecap="round"/>
      <path d="${ARC}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="7" stroke-dasharray="3 22" stroke-linecap="round"/>
      <path id="eRoad" d="${ROAD}" fill="none" stroke="#FFD27A" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
      <path id="eArc" d="${ARC}" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>
      ${STOPS.map((s, i) => `<g id="es${i}" transform="translate(${s.x} ${s.y}) scale(0)"><circle r="46" fill="${s.c}" opacity=".28"/><circle r="24" fill="${s.c}" stroke="#0B1522" stroke-width="8"/></g>`).join("")}
      <image id="ePlane" href="${A}plane.png" x="-150" y="-38" width="300" height="77" opacity="0"/>
    </svg>
    ${STOPS.map((s, i) => `<div class="chip" id="ec${i}" style="left:${s.x - 20}px;top:${s.y + 60}px"><b>${s.time}</b>${s.what}</div>`).join("")}
  </div>
  <div class="fill" style="background:linear-gradient(90deg,rgba(4,8,16,.55),rgba(4,8,16,0) 50%)"></div>
  <div class="stack" id="eStack"><div><span>Plans</span></div><div><span>backwards</span></div><div><span style="color:#FFB547">from the flight.</span></div></div>
</section>
<section class="L" id="F">
  <div class="verb" id="fVerb">PLAN</div><div class="verbsub" id="fSub"></div>
  <div class="dev" id="fDev"><div class="scr">${SCREENS.map((s, i) => `<img id="fs${i}" src="${A}${s.img}.jpg" style="opacity:0">`).join("")}</div><div class="bar" id="fBar"></div></div>
</section>
<section class="L" id="G">
  <div id="gGlow" style="position:absolute;left:560px;top:180px;width:800px;height:600px;background:radial-gradient(closest-side,rgba(255,181,71,.28),transparent);opacity:0"></div>
  <div style="position:absolute;left:0;right:0;top:330px;display:flex;justify-content:center;align-items:center;gap:56px">
    <div id="gMark" style="width:190px;height:207px">${MARK()}</div>
    <div class="word2" id="gWord">${[..."GateCue"].map((c) => `<span>${c}</span>`).join("")}</div>
  </div>
  <div class="tag" id="gTag">Checks the clock before you pay.</div>
  <div class="small" id="gSmall">An Alexa+ travel co-pilot</div>
</section>
<canvas id="grain" width="480" height="270"></canvas>
<div id="flash"></div>`;

const $ = (id: string) => document.getElementById(id)!;
const S = (id: string, css: Partial<CSSStyleDeclaration> | Record<string, string>) => Object.assign($(id).style, css);
const show = (id: string, on: boolean, o = 1) => { $(id).style.opacity = on ? String(o) : "0"; };

// film grain, re-seeded per frame
const g = ($("grain") as HTMLCanvasElement).getContext("2d")!;
function grain(f: number) {
  const img = g.createImageData(480, 270);
  for (let i = 0; i < img.data.length; i += 4) { const v = rnd(i * .37 + f * 13.1) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
}

// ---- B: kinetic words, one per beat, each on its own colour field ----------------------------------
const WORDS = [
  { t: 2.0, text: "ONE LETTER.", bg: "#FFB547", fg: "#0B1522", s1: "#0B1522", s2: "#FF4F43" },
  { t: 2.5, text: "ONE MISSED", bg: "#FF4F43", fg: "#FFFFFF", s1: "#FFB547", s2: "#0B1522" },
  { t: 3.0, text: "FLIGHT.", bg: "#0B1522", fg: "#FFFFFF", s1: "#2F6BE6", s2: "#FFB547" },
  { t: 3.5, text: "$0 BACK.", bg: "#F4F1EA", fg: "#0B1522", s1: "#FF4F43", s2: "#2F6BE6" },
];
let lastWord = -1;

function render(t: number) {
  const frame = Math.round(t * 60);
  grain(frame);
  // ---------------- A: HOOK (0 - 2.0) ----------------
  const onA = t < 2.0;
  show("A", onA);
  if (onA) {
    const inK = outExpo(seg(t, 0, .32));
    const flip = seg(t, 1.0, 1.12);
    const [sx, sy] = shake(t, .22, 34);
    const [fx, fy] = shake(t, 1.0, 46, .35);
    const punch = 1 + .08 * (1 - outCubic(seg(t, 1.0, 1.3))) * (t >= 1 ? 1 : 0);
    const exit = inExpo(seg(t, 1.72, 2.0));
    S("aClockWrap", { transform: `translate(${sx + fx}px,${sy + fy}px) scale(${lerp(2.8, 1, inK) * punch * (1 + exit * 5)})`, filter: `blur(${lerp(24, 0, inK) + exit * 30}px)`, opacity: String(clamp(inK * 1.5) * (1 - exit)) });
    const pillIn = outBack(seg(t, .5, .72));
    const pill = $("aPill");
    if (t < 1.06) { pill.textContent = "AM"; pill.className = "pill"; } else { pill.textContent = "PM"; pill.className = "pill pm"; }
    const rot = t < 1.0 ? 0 : t < 1.06 ? lerp(0, 90, seg(t, 1.0, 1.06)) : lerp(-90, 0, outBack(seg(t, 1.06, 1.22)));
    S("aNum", { transform: `translateX(${(1 - pillIn) * (t < .5 ? 1 : 1) * 190}px)` });
    S("aPill", { transform: `translateY(${lerp(120, 0, pillIn)}px) rotateX(${rot}deg) scale(${t < .5 ? 0 : 1})`, opacity: String(t < .5 ? 0 : 1) });
    // RGB split glitch around the flip
    const gl = t >= 1.0 && t < 1.3 ? 1 - seg(t, 1.0, 1.3) : 0;
    S("aR", { opacity: String(gl * .8), transform: `translate(${-22 * gl + (rnd(frame) - .5) * 30 * gl}px,${(rnd(frame + 5) - .5) * 20 * gl}px)` });
    S("aC", { opacity: String(gl * .8), transform: `translate(${22 * gl + (rnd(frame + 3) - .5) * 30 * gl}px,${(rnd(frame + 8) - .5) * 20 * gl}px)` });
    S("a2", { opacity: t >= 1.0 ? "1" : "0" });
    S("a1", { transform: `scale(${lerp(1.25, 1.08, outCubic(seg(t, 0, 1)))})` });
    S("a2", { transform: `scale(${lerp(1.18, 1.05, outCubic(seg(t, 1, 2)))})` });
    const capK = outCubic(seg(t, 1.35, 1.6));
    S("aCap", { opacity: String(capK * (1 - exit)), transform: `translateY(${lerp(40, 0, capK)}px)` });
  }
  // ---------------- B: KINETIC TYPE (2.0 - 4.0) ----------------
  const onB = t >= 2.0 && t < 4.0;
  show("B", onB);
  if (onB) {
    const wi = Math.min(3, Math.floor((t - 2.0) / BEAT));
    const w = WORDS[wi];
    if (wi !== lastWord) {
      lastWord = wi;
      $("bW").innerHTML = [...w.text].map((c) => `<span>${c === " " ? "&nbsp;" : c}</span>`).join("");
      S("bBg", { background: w.bg }); S("bW", { color: w.fg });
      S("bS1", { background: w.s1 }); S("bS2", { background: w.s2 });
    }
    const lt = t - w.t;
    $("bW").querySelectorAll<HTMLSpanElement>("span").forEach((sp, i) => {
      const k = outExpo(clamp((lt - i * .022) / .2));
      sp.style.transform = `translateY(${lerp(140, 0, k)}%) skewX(${lerp(-18, 0, k)}deg)`;
      sp.style.opacity = String(clamp(k * 2));
    });
    const drift = lerp(0, -90, lt / BEAT);
    S("bW", { transform: `translate(${drift}px,-50%)` });
    // two diagonal stripes whip across on every beat
    const s1 = outExpo(clamp(lt / .3)), s2 = outExpo(clamp((lt - .06) / .3));
    S("bS1", { transform: `translate(${lerp(-3200, 2200, s1)}px, ${780}px) rotate(-14deg)`, height: "90px" });
    S("bS2", { transform: `translate(${lerp(-3400, 2000, s2)}px, ${880}px) rotate(-14deg)`, height: "34px" });
    if (wi === 3) { // strike-through on "$0 BACK."
      const k = outExpo(clamp((lt - .18) / .22));
      $("bW").style.textDecoration = "none";
      $("bW").style.backgroundImage = `linear-gradient(#FF4F43,#FF4F43)`;
      $("bW").style.backgroundRepeat = "no-repeat";
      $("bW").style.backgroundSize = `${k * 100}% 22px`;
      $("bW").style.backgroundPosition = "0 55%";
    } else { $("bW").style.backgroundImage = "none"; }
    const [sx, sy] = shake(t, w.t, 16, .18);
    $("B").style.transform = `translate(${sx}px,${sy}px)`;
  }
  // ---------------- C: SHAPE PLAY (4.0 - 6.0) ----------------
  const onC = t >= 4.0 && t < 6.0;
  show("C", onC);
  if (onC) {
    const mark = $("cMark");
    const arch = mark.querySelector<SVGPathElement>(".arch")!, dot = mark.querySelector<SVGCircleElement>(".dot")!;
    arch.style.strokeDashoffset = String(100 - 100 * outCubic(seg(t, 4.0, 4.4)));
    // dot drops and bounces on the beats
    const d1 = seg(t, 4.2, 4.5), d2 = seg(t, 4.5, 5.0);
    const dy = t < 4.2 ? -40 : t < 4.5 ? lerp(-40, 0, d1 * d1) : -9 * Math.sin(Math.PI * d2);
    dot.setAttribute("cy", String(15 + dy)); dot.style.opacity = t < 4.2 ? "0" : "1";
    // 5.0: the arch becomes a countdown ring
    const morph = outExpo(seg(t, 5.0, 5.18));
    S("cMark", { opacity: String(1 - morph), transform: `scale(${1 + morph * .6}) rotate(${morph * 25}deg)` });
    const ring = seg(t, 5.0, 5.5);
    ($("cRing") as any).style.strokeDashoffset = String(lerp(0, 100, ring));
    ($("cRing") as any).style.opacity = String(morph * (t < 5.55 ? 1 : 0));
    ($("cRingT") as any).style.opacity = String(morph * (t < 5.55 ? 1 : 0));
    ($("cRing") as any).style.stroke = ring > .75 ? "#FF4F43" : "#FFB547";
    S("cNum", { opacity: String(morph * (t < 5.55 ? 1 : 0)), color: ring > .75 ? "#FF6B5E" : "#fff" });
    $("cNum").textContent = String(Math.max(0, Math.round(45 * (1 - ring))));
    // 5.5: burst into six skies arranged on the sun's path
    SKIES.forEach((_, i) => {
      const k = outBack(seg(t, 5.5 + i * .04, 5.78 + i * .04));
      const ang = Math.PI * (1 - i / 5);
      const cx = 960 + Math.cos(ang) * 640, cy = 700 - Math.sin(ang) * 420;
      const r = 118 * k;
      const c = $(`ccc${i}`); c.setAttribute("cx", String(cx)); c.setAttribute("cy", String(cy)); c.setAttribute("r", String(Math.max(0, r)));
      const o = $(`cdot${i}`); o.setAttribute("cx", String(cx)); o.setAttribute("cy", String(cy)); o.setAttribute("r", String(Math.max(0, r)));
    });
    // camera push into the golden one at the end of the bar
    const push = inExpo(seg(t, 5.8, 6.0));
    $("cSvg").style.transform = `scale(${1 + push * 3.2})`; $("cSvg").style.transformOrigin = `${960 + Math.cos(Math.PI * (1 - 4 / 5)) * 640}px ${700 - Math.sin(Math.PI * (1 - 4 / 5)) * 420}px`;
  }
  // ---------------- D: COLOUR SHIFT (6.0 - 8.0), six skies in triplets ----------------
  const onD = t >= 6.0 && t < 8.0;
  show("D", onD);
  if (onD) {
    const step = 2 / 6;
    SKIES.forEach((s, i) => {
      const t0 = 6.0 + i * step;
      const k = i === 0 ? 1 : outExpo(seg(t, t0, t0 + .22));
      S(`d${i}`, { clipPath: `circle(${k * 120}% at ${i % 2 ? 72 : 28}% ${i % 3 === 0 ? 40 : 60}%)`, opacity: t >= t0 || i === 0 ? "1" : "0" });
      S(`di${i}`, { transform: `scale(${lerp(1.18, 1.04, outCubic(seg(t, t0, t0 + step + .3)))}) rotate(${lerp(i % 2 ? 1.5 : -1.5, 0, outCubic(seg(t, t0, t0 + step)))}deg)` });
    });
    const idx = Math.min(5, Math.floor((t - 6.0) / step));
    const s = SKIES[idx];
    const lt = (t - 6.0) - idx * step;
    const k = outExpo(clamp(lt / .18));
    $("dClock").innerHTML = `${s.t}<small style="color:${s.ap === "PM" ? "#FF6B5E" : "#FFD27A"}">${s.ap}</small>`;
    S("dClock", { transform: `translateY(${lerp(60, 0, k)}px)`, opacity: String(k) });
    const lk = outCubic(seg(t, 6.05, 6.35));
    S("dLabel", { opacity: String(lk), transform: `translateX(${lerp(-40, 0, lk)}px)`, letterSpacing: `${lerp(.6, .32, lk)}em` });
    const exit = inExpo(seg(t, 7.8, 8.0));
    $("D").style.transform = `scale(${1 + exit * .3})`; $("D").style.filter = `blur(${exit * 14}px)`;
  }
  // ---------------- E: CAMERA MOVE (8.0 - 11.0) through the painted trip ----------------
  const onE = t >= 8.0 && t < 11.05;
  show("E", onE);
  if (onE) {
    const k = inOutCubic(seg(t, 8.0, 11.0));
    const zoom = lerp(1.38, 1.06, k) + .05 * Math.sin(k * Math.PI);
    const focusX = lerp(280 * K, 1150 * K, k), focusY = lerp(560 * K, 470 * K, k);
    const tx = 960 - focusX * zoom, ty = 720 - focusY * zoom;
    S("cam", { transform: `translate(${tx}px,${ty}px) scale(${zoom}) rotate(${lerp(-1.2, .8, k)}deg)` });
    ($("eRoad") as any).style.strokeDashoffset = String(100 - 100 * outCubic(seg(t, 8.4, 9.6)));
    ($("eArc") as any).style.strokeDashoffset = String(100 - 100 * inOutCubic(seg(t, 9.6, 10.6)));
    STOPS.forEach((s, i) => {
      const p = outBack(seg(t, s.t, s.t + .25));
      $(`es${i}`).setAttribute("transform", `translate(${s.x} ${s.y}) scale(${p})`);
      S(`ec${i}`, { opacity: String(clamp(p)), transform: `scale(${lerp(.6, 1, clamp(p))})` });
    });
    const pl = $("ePlane") as unknown as SVGImageElement;
    const pp = inOutCubic(seg(t, 9.6, 10.6));
    const path = $("eArc") as unknown as SVGPathElement;
    const L = path.getTotalLength(), pt = path.getPointAtLength(L * pp), pt2 = path.getPointAtLength(Math.min(L, L * pp + 2));
    const ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI;
    pl.setAttribute("transform", `translate(${pt.x} ${pt.y}) rotate(${ang})`);
    pl.setAttribute("opacity", String(t > 9.6 && t < 10.62 ? 1 : 0));
    // stacked headline, one line per beat, parallax against the pan
    $("eStack").querySelectorAll<HTMLSpanElement>("span").forEach((sp, i) => {
      const a = outExpo(seg(t, 8.0 + i * .5, 8.3 + i * .5));
      const out = inExpo(seg(t, 10.3, 10.6));
      sp.style.transform = `translateY(${lerp(110, 0, a) - out * 110}%)`;
    });
    $("eStack").style.transform = `translateX(${lerp(0, -80, k)}px)`;
    const whip = inExpo(seg(t, 10.85, 11.05));
    $("E").style.filter = `blur(${whip * 18}px)`; $("E").style.transform = `translateX(${-whip * 600}px)`;
  }
  // ---------------- F: PRODUCT (11.0 - 13.5), one screen per beat ----------------
  const onF = t >= 11.0 && t < 13.5;
  show("F", onF);
  if (onF) {
    const inK = outExpo(seg(t, 11.0, 11.35));
    const k = seg(t, 11.0, 13.5);
    S("fDev", { transform: `perspective(2400px) translate(${lerp(500, 0, inK)}px,${lerp(80, 0, inK)}px) rotateY(${lerp(-38, -12, inK) + k * 6}deg) rotateX(${lerp(14, 5, inK)}deg) scale(${lerp(.9, 1, inK) + k * .04})` });
    const si = Math.min(4, Math.floor((t - 11.0) / BEAT));
    SCREENS.forEach((s, i) => {
      const t0 = 11.0 + i * BEAT;
      const a = outExpo(seg(t, t0, t0 + .16));
      const vis = i === si || (i === si - 1 && t - (11.0 + si * BEAT) < .16);
      S(`fs${i}`, { opacity: vis ? "1" : "0", transform: `translateX(${i === si ? lerp(28, 0, a) : -lerp(0, 28, outExpo(clamp((t - (11.0 + si * BEAT)) / .16)))}%)`, filter: `blur(${i === si ? (1 - a) * 10 : 0}px)` });
    });
    const lt = t - (11.0 + si * BEAT);
    const vk = outExpo(clamp(lt / .2));
    $("fVerb").textContent = SCREENS[si].verb; $("fSub").textContent = SCREENS[si].sub;
    S("fVerb", { transform: `translateX(${lerp(-80, 0, vk)}px)`, opacity: String(vk), color: si === 2 ? "rgba(255,79,67,.95)" : "transparent", webkitTextStroke: si === 2 ? "0" : "3px rgba(255,255,255,.9)" } as any);
    S("fSub", { opacity: String(outCubic(clamp((lt - .06) / .2))), transform: `translateY(${lerp(20, 0, outCubic(clamp((lt - .06) / .2)))}px)` });
    S("fBar", { backgroundPosition: `${(t * 120) % 200}% 0`, boxShadow: `0 0 ${30 + 30 * (1 - clamp(lt / .3))}px ${si === 3 ? "rgba(255,181,71,.8)" : "rgba(18,195,238,.8)"}` });
    const [sx, sy] = shake(t, 11.0 + si * BEAT, 10, .15);
    $("F").style.transform = `translate(${sx}px,${sy}px)`;
  }
  // ---------------- G: END (13.5 - 15.0) ----------------
  const onG = t >= 13.5;
  show("G", onG);
  if (onG) {
    const mark = $("gMark"), arch = mark.querySelector<SVGPathElement>(".arch")!, dot = mark.querySelector<SVGCircleElement>(".dot")!;
    arch.style.strokeDashoffset = String(100 - 100 * outCubic(seg(t, 13.5, 13.8)));
    const d = seg(t, 13.62, 14.0);
    dot.setAttribute("cy", String(15 - 26 * (1 - outBounce(d)))); dot.style.opacity = t < 13.62 ? "0" : "1";
    $("gWord").querySelectorAll<HTMLSpanElement>("span").forEach((sp, i) => {
      const k = outExpo(seg(t, 13.62 + i * .035, 13.95 + i * .035));
      sp.style.transform = `translateY(${lerp(70, 0, k)}px)`; sp.style.opacity = String(k);
    });
    const tk = outCubic(seg(t, 14.0, 14.3)), sk = outCubic(seg(t, 14.2, 14.5));
    S("gTag", { opacity: String(tk), transform: `translateY(${lerp(24, 0, tk)}px)` });
    S("gSmall", { opacity: String(sk), letterSpacing: `${lerp(.5, .28, sk)}em` });
    S("gGlow", { opacity: String(outCubic(seg(t, 13.6, 14.4)) * (.85 + .15 * Math.sin(t * 6))) });
  }
  // white flash frames on the big hits
  const hits = [0, 1.0, 5.5, 8.0, 13.5];
  let fl = 0; for (const h of hits) { const k = seg(t, h, h + .12); if (k > 0 && k < 1) fl = Math.max(fl, (1 - k) * (h === 13.5 ? .9 : .55)); }
  $("flash").style.opacity = String(fl);
}
(window as any).seek = (t: number) => render(t);
(window as any).ready = () => Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = r; i.onerror = r; })));
if (!location.hash.includes("rec")) { const s0 = performance.now(); const loop = () => { render(((performance.now() - s0) / 1000) % 15); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
