import { App } from "@modelcontextprotocol/ext-apps";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Alexa+ layout guide: hostContext.deviceClass wins; one root zoom per device (Echo Show 8/15 = 1.667).
const ZOOM: Record<string, number> = { "echo-show-8": 1.667, "echo-show-15": 1.667, "echo-show": 1.667, mobile: 1, web: 1 };

export function applyHostContext(ctx: any) {
  if (!ctx) return;
  const root = document.documentElement;
  if (ctx.theme) root.dataset.theme = ctx.theme;
  const dc = ctx.deviceClass ?? ctx.platform ?? "web";
  root.style.setProperty("--zoom", String(ZOOM[dc] ?? 1));
  document.body.dataset.device = dc;
  if (ctx.displayMode) document.body.dataset.display = ctx.displayMode;
}

export async function startCard<T>(name: string, render: (data: T, app: App) => void) {
  const app = new App({ name: `gatecue-${name}`, version: "0.3.0" });
  let last: T | undefined;
  app.ontoolresult = (result: any) => {
    const data = result?.structuredContent as T | undefined;
    if (data) { last = data; render(data, app); }
  };
  app.onhostcontextchanged = (ctx: any) => { applyHostContext(ctx); if (last) render(last, app); };
  await app.connect();
  applyHostContext(app.getHostContext());
  return app;
}

// Tapping an action is the same as saying it (Alexa+ input parity).
export async function say(app: App, text: string) {
  await app.sendMessage({ role: "user", content: [{ type: "text", text }] } as any);
}
export function wireSay(root: HTMLElement, app: App) {
  root.querySelectorAll<HTMLButtonElement>("button[data-say]").forEach((b) => b.addEventListener("click", () => say(app, b.dataset.say!)));
}

export function mins(m: number): string {
  const a = Math.abs(Math.round(m));
  if (a < 90) return `${a} min`;
  const h = Math.floor(a / 60), r = a % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const TZ = "America/Los_Angeles";
