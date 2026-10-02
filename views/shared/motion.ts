// Small motion helpers for cards. Everything resolves to the same final frame with or without motion.
export const motionOK = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

type Box = [number, number, number, number];
// Camera move over an SVG: glides the viewBox along a smooth curve from `from`, bending toward `via`, to `to`.
export function camera(svg: SVGSVGElement, from: Box, via: Box, to: Box, ms: number, delay = 0) {
  if (!motionOK()) return;
  const set = (b: number[]) => svg.setAttribute("viewBox", b.map((v) => v.toFixed(2)).join(" "));
  set(from);
  const t0 = performance.now() + delay;
  const step = (now: number) => {
    const raw = Math.min(1, Math.max(0, (now - t0) / ms));
    const t = easeInOut(raw);
    // Quadratic Bezier per component: smooth, no stop at the middle shot.
    set(from.map((f, i) => (1 - t) * (1 - t) * f + 2 * (1 - t) * t * via[i] + t * t * to[i]));
    if (raw < 1) requestAnimationFrame(step); else set(to);
  };
  requestAnimationFrame(step);
}

// Numbers count up to their value (margins, minutes). Screen readers get the final value straight away.
export function countUp(root: ParentNode, ms = 900, delay = 300) {
  root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
    const to = Number(el.dataset.count);
    el.setAttribute("aria-label", String(to));
    if (!motionOK() || !Number.isFinite(to) || to === 0) { el.textContent = String(to); return; }
    const t0 = performance.now() + delay;
    el.textContent = "0";
    const step = (now: number) => {
      const raw = Math.min(1, Math.max(0, (now - t0) / ms));
      el.textContent = String(Math.round(easeOut(raw) * to));
      if (raw < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
