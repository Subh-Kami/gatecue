// GateCue Alexa+ simulator: plays Alexa+'s role as the MCP host.
// Renders MCP Apps cards (AppBridge, sandboxed iframes), elicitation dialogs, and background Tasks,
// on four device classes: Echo Show 8, Echo Show 15, phone, and voice-only.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CallToolResultSchema, ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { route, SCENARIO, type RouterState, type Step } from "./router.js";
import { sayP, THINKING, intro, handOffClock, tripGlance } from "./motion.js";

type Device = "echo-show-8" | "echo-show-15" | "mobile" | "voice";
const DEVICES: Record<Device, { label: string; w: number; h: number }> = {
  "echo-show-8": { label: "Echo Show 8", w: 1280, h: 800 },
  "echo-show-15": { label: "Echo Show 15", w: 1280, h: 720 },
  mobile: { label: "Phone", w: 390, h: 844 },
  voice: { label: "Voice only", w: 520, h: 520 },
};

const q = new URLSearchParams(location.search);
const SERVER = q.get("server") ?? "http://localhost:8787";
let device = (q.get("device") as Device) ?? (window.innerWidth < 640 || (window.innerWidth < 900 && window.innerHeight > window.innerWidth * 1.2) ? "mobile" : "echo-show-8");
let theme: "dark" | "light" = (q.get("theme") as any) ?? "dark";
const speak = q.get("speak") === "1";

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const screen = $<HTMLDivElement>("#screen");
const convo = $<HTMLDivElement>("#convo");
const frame = $<HTMLDivElement>("#frame");
const input = $<HTMLInputElement>("#utter");
const modalRoot = $<HTMLDivElement>("#modal");
const fullscreenRoot = $<HTMLDivElement>("#fullscreen");

const state: RouterState = { lastOptions: [], scenario: SCENARIO };

// The brain that picks tools: a real model behind /sim/agent (Claude or Bedrock), or the scripted demo router.
// ?brain=scripted forces the router (deterministic recordings and tests).
type ToolCall = { id: string; name: string; args: Record<string, unknown> };
type AgentMsg = { role: "user"; text: string } | { role: "assistant"; text?: string; toolCalls?: ToolCall[]; raw?: unknown } | { role: "tool"; results: Array<{ id: string; name: string; text: string; data?: unknown; isError?: boolean }> };
let brain: { provider: string; label: string } = { provider: "scripted", label: "scripted demo router" };
const transcript: AgentMsg[] = [];
// Background lookups the traveller doesn't need to hear.
const SILENT_TOOLS = new Set(["get_trip_context"]);
let lastTurn: HTMLElement | undefined;

// Scenario clock shown in the status bar (Echo Show shows local time).
let clockStart = new Date(q.get("now") ?? "2026-10-15T05:30:00-07:00").getTime();
let realStart = Date.now();
const SCENES: Record<string, string> = { night: "2026-10-14T21:40:00-07:00", airport: "2026-10-15T05:30:00-07:00" };
async function setScene(name: string) {
  const iso = SCENES[name] ?? name;
  clockStart = new Date(iso).getTime(); realStart = Date.now(); tickClock();
  // Demo-only endpoint on the GateCue server (not an MCP tool): moves the scenario clock for filming.
  await fetch(new URL("/demo/clock", SERVER), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ now: iso }) }).catch(() => {});
}
const clockSpeed = Number(q.get("speed") ?? 1);
function tickClock() {
  const t = new Date(clockStart + (Date.now() - realStart) * clockSpeed);
  const hhmm = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Los_Angeles" }).format(t).replace(/\s?[AP]M$/, "");
  $("#clock").textContent = hhmm;
  $("#ambTime").textContent = hhmm;
  $("#ambDate").textContent = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(t);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Los_Angeles" }).format(t)) + t.getMinutes() / 60;
  renderAmbient(hour);
}
// Home screen art comes from the same generated set the cards use (served by the GateCue server).
let assetManifest: any = null;
fetch(new URL("/assets/manifest.json", SERVER)).then((r) => r.json()).then((m) => { assetManifest = m; $("#ambScene").dataset.key = ""; tickClock(); }).catch(() => {});
function renderAmbient(hour: number) {
  const night = hour >= 20 || hour < 4.5;
  const kind = night ? "home" : hour < 6.6 ? "airfield" : "airfield";
  const slot = night ? "night" : hour < 6.6 ? "predawn" : hour < 10 ? "morning" : hour < 16 ? "day" : hour < 19 ? "golden" : "dusk";
  const amb = $("#ambScene");
  const key = `${kind}:${slot}:${assetManifest ? 1 : 0}`;
  $("#ambTry").textContent = night ? "“Alexa, I need to be at an 11 AM meeting in San Francisco tomorrow.”" : "“Alexa, watch my check-in time.”";
  if (amb.dataset.key === key) return;
  amb.dataset.key = key;
  const e = assetManifest?.[kind]?.[slot] ?? assetManifest?.[kind]?.[Object.keys(assetManifest?.[kind] ?? {})[0]];
  if (!e) { amb.innerHTML = ""; return; }
  const u = (p: string) => new URL(`/assets/${p}`, SERVER).href;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  amb.innerHTML = `<img src="${u(e.img)}" alt="">${e.video && !reduce ? `<video src="${u(e.video)}" poster="${u(e.img)}" autoplay muted loop playsinline></video>` : ""}`;
  const v = amb.querySelector("video");
  v?.addEventListener("playing", () => v.classList.add("on"), { once: true });
}
// Echo Show idles on a home screen; the first thing you say wakes it and the conversation sheet slides up.
function wake() { if (!document.body.classList.contains("awake")) { handOffClock(screen); document.body.classList.add("awake", "listening"); setTimeout(() => document.body.classList.remove("listening"), 700); } else { document.body.classList.add("listening"); setTimeout(() => document.body.classList.remove("listening"), 500); } }

// Follow-up chips, as Alexa+ shows under a response.
function chipsFor(tool: string, sc: any): string[] {
  switch (tool) {
    case "plan_trip": return ["Book the ride", "Email me the plan", "Watch my check-in time"];
    case "book_ride": return ["Watch my check-in time"];
    case "watch_trip": return ["My flight got cancelled"];
    case "search_flights": return sc?.options?.length ? [`Review ${sc.options[0].flight.number} at ${sc.options[0].check.departureDisplay}`, "Just book the 6 o'clock"] : [];
    case "review_flight": return sc?.check?.makesGoal ? ["Book it", "Other flights"] : ["Flights that make it", "Book it anyway"];
    default: return [];
  }
}
const ICON_SHARE = `<span class="round" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/></svg></span>`;
const ICON_UP = `<span class="round" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.3 6A2 2 0 0 1 17.7 20H7"/></svg></span>`;
const ICON_DOWN = `<span class="round" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-3-2l1-5H5a2 2 0 0 1-2-2.3l1.3-6A2 2 0 0 1 6.3 4H17"/></svg></span>`;
function followups(turn: HTMLElement, chips: string[]) {
  if (device === "voice") return;
  const row = document.createElement("div");
  row.className = "followups";
  row.innerHTML = ICON_SHARE + ICON_UP + ICON_DOWN + chips.map((c) => `<button class="chip">${esc(c)}</button>`).join("");
  row.querySelectorAll<HTMLButtonElement>(".chip").forEach((b) => b.addEventListener("click", () => handleUtterance(b.textContent ?? "", "tap")));
  turn.appendChild(row);
}
function speaking(on: boolean, notify = false) {
  document.body.dataset.speaking = on && !notify ? "1" : "0";
  document.body.dataset.notify = on && notify ? "1" : "0";
}
let client: Client;
const tools = new Map<string, any>();
let toolDefs: Array<{ name: string; description?: string; inputSchema: unknown }> = [];
const bridges = new Set<AppBridge>();

function hostContext(displayMode: "inline" | "fullscreen", tool?: any) {
  const d = DEVICES[device];
  return {
    theme, displayMode, availableDisplayModes: ["inline", "fullscreen"],
    deviceClass: device, platform: device === "mobile" ? "mobile" : "web", isMobile: device === "mobile",
    containerDimensions: { width: d.w, maxHeight: d.h }, maxWidth: d.w, maxHeight: d.h,
    safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    locale: "en-US", timeZone: "America/Los_Angeles",
    ...(tool ? { toolInfo: { tool } } : {}),
  } as any;
}

function applyDevice() {
  const d = DEVICES[device];
  document.body.dataset.device = device;
  document.documentElement.dataset.theme = theme;
  screen.style.width = `${d.w}px`;
  screen.style.height = `${d.h}px`;
  // Fit the device into whatever space the stage has (the header wraps on narrow windows). zoom, unlike
  // transform, changes the layout box, so the scaled device stays centred at every window size.
  const stage = frame.parentElement!;
  const pad = window.innerWidth < 700 ? 12 : 32;
  const availW = stage.clientWidth - pad * 2, availH = stage.clientHeight - pad * 2;
  const bezel = device === "mobile" ? 36 : 60;
  const s = Math.max(.2, Math.min(1, availW / (d.w + bezel), availH / (d.h + bezel)));
  frame.style.transform = "";
  (frame.style as any).zoom = String(s);
  frame.style.width = `${d.w + bezel}px`;
  frame.style.height = `${d.h + bezel}px`;
  document.querySelectorAll<HTMLButtonElement>("[data-device]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.device === device)));
  for (const b of bridges) b.setHostContext(hostContext("inline"));
}

// Like the device, keep the newest Alexa response at the top of the sheet so its card and chips are in view.
function focusTurn(el: HTMLElement) { convo.scrollTop = Math.max(0, el.offsetTop - 24); }

function add(html: string, cls: string) {
  // Each Alexa response gets a fresh screen; earlier ones move to history (the history button brings them back).
  if (cls.startsWith("alexa") && device !== "voice") convo.querySelectorAll(".turn:not(.old)").forEach((t) => t.classList.add("old"));
  const el = document.createElement("div");
  el.className = `turn ${cls}`;
  el.innerHTML = html;
  convo.appendChild(el);
  if (cls.startsWith("alexa")) requestAnimationFrame(() => focusTurn(el));
  else requestAnimationFrame(() => { convo.scrollTop = convo.scrollHeight; });
  return el;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function alexaSays(text: string) {
  add(sayP(text), "alexa");
  if (speak && "speechSynthesis" in window) {
    speechSynthesis.cancel();
    speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(text), { rate: 1.05 }));
  }
}

async function renderCard(toolName: string, args: any, result: any, container: HTMLElement, mode: "inline" | "fullscreen" = "inline") {
  const tool = tools.get(toolName);
  const uri = tool?._meta?.ui?.resourceUri;
  if (!uri || device === "voice") return;
  const res: any = await client.readResource({ uri });
  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.title = `${toolName} card`;
  iframe.className = "card";
  container.appendChild(iframe);
  const bridge = new AppBridge(client, { name: "GateCue Alexa+ Simulator", version: "0.2.0" }, { openLinks: {}, serverTools: {}, logging: {}, message: { text: {} } } as any, { hostContext: hostContext(mode, tool) });
  bridges.add(bridge);
  bridge.onsizechange = ({ height }) => { if (height && mode === "inline") iframe.style.height = `${Math.ceil(height)}px`; };
  bridge.onmessage = async ({ content }) => {
    const text = (content as any[]).filter((c) => c.type === "text").map((c) => c.text).join(" ");
    if (text) void handleUtterance(text, "tap");
    return {};
  };
  bridge.onrequestdisplaymode = async ({ mode: m }) => {
    if (m === "fullscreen") { openFullscreen(toolName, args, result); return { mode: "fullscreen" }; }
    return { mode: "inline" };
  };
  bridge.onopenlink = async ({ url }) => { window.open(url, "_blank", "noopener"); return {}; };
  bridge.oninitialized = async () => {
    await bridge.sendToolInput({ arguments: args });
    await bridge.sendToolResult(result);
    container.dataset.ready = "1";
    if (container.classList.contains("turn")) focusTurn(container);
    document.body.dataset.cards = String(Number(document.body.dataset.cards ?? 0) + 1);
  };
  await bridge.connect(new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!));
  iframe.srcdoc = withCsp(res.contents[0].text, res.contents[0]._meta?.ui?.csp ?? tool?._meta?.ui?.csp);
}

// Hosts enforce the CSP a card declares (MCP Apps): nothing loads unless its origin was declared.
function withCsp(html: string, csp: { resourceDomains?: string[]; connectDomains?: string[] } = {}) {
  const res = (csp.resourceDomains ?? []).join(" "), con = (csp.connectDomains ?? []).join(" ");
  const policy = `default-src 'none'; script-src 'unsafe-inline' ${res}; style-src 'unsafe-inline' ${res}; img-src data: blob: ${res}; media-src ${res || "'none'"}; font-src data: ${res}; connect-src ${con || "'none'"}; frame-src 'none'; base-uri 'none'`;
  return html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`);
}

function openFullscreen(toolName: string, args: any, result: any) {
  fullscreenRoot.innerHTML = `<button class="close" aria-label="Close full screen">Close</button>`;
  fullscreenRoot.hidden = false;
  fullscreenRoot.querySelector(".close")!.addEventListener("click", () => { fullscreenRoot.hidden = true; fullscreenRoot.innerHTML = ""; });
  void renderCard(toolName, args, result, fullscreenRoot, "fullscreen");
}

async function callTool(name: string, args: any, quiet = false, background = false): Promise<any> {
  if (name === "watch_trip") {
    if (!background) return watch(args);
    void watch(args);
    return { content: [{ type: "text", text: "Started watching in the background. GateCue will speak up when it's time to move." }] };
  }
  if (quiet) {
    const r: any = await client.callTool({ name, arguments: args }, CallToolResultSchema, { timeout: 60_000 });
    if (name === "search_flights" && r.structuredContent?.options) state.lastOptions = r.structuredContent.options;
    return r;
  }
  const turn = add(THINKING, "alexa");
  document.body.classList.add("is-thinking");
  lastTurn = turn;
  speaking(true);
  let result: any;
  try {
    result = await client.callTool({ name, arguments: args }, CallToolResultSchema, { timeout: 15 * 60_000 });
  } catch (e: any) {
    turn.innerHTML = sayP(`Something went wrong. ${e?.message ?? ""}`);
    document.body.classList.remove("is-thinking");
    speaking(false);
    return { isError: true, content: [{ type: "text", text: `The tool call failed: ${e?.message ?? "unknown error"}` }] };
  }
  const text = (result.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ");
  $("#caption").classList.remove("on");
  document.body.classList.remove("is-thinking");
  turn.innerHTML = sayP(text);
  if (speak && "speechSynthesis" in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); }
  setTimeout(() => speaking(false), Math.min(6000, 60 * text.length));
  const sc = result.structuredContent;
  if (name === "search_flights" && sc?.options) state.lastOptions = sc.options;
  if (name === "review_flight" && sc?.quoteId) state.lastQuoteId = sc.quoteId;
  if (!result.isError) await renderCard(name, args, result, turn);
  followups(turn, chipsFor(name, sc));
  return result;
}

async function watch(args: any) {
  const turn = add(sayP("I'll watch your check-in time and tell you when to move."), "alexa watching");
  lastTurn = turn;
  followups(turn, []);
  const stream = client.experimental.tasks.callToolStream({ name: "watch_trip", arguments: args }, CallToolResultSchema, { task: { ttl: 60 * 60_000 } } as any);
  for await (const m of stream as any) {
    if (m.type === "result") {
      const text = m.result.content[0].text;
      const t = add(sayP(text), "alexa proactive");
      speaking(true, true);
      if (speak && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      await renderCard("watch_trip", args, m.result, t);
      followups(t, chipsFor("watch_trip", m.result.structuredContent));
      setTimeout(() => speaking(false), 5000);
      document.body.dataset.nudged = "1";
    }
  }
}

// What the person said appears as a live caption above the light bar (as on Echo Show), not in the response history.
let capTimer: number | undefined;
function showUtterance(text: string, via: "voice" | "tap") {
  const c = $("#caption");
  c.textContent = via === "tap" ? `Tapped: ${text}` : `“${text}”`;
  c.classList.add("on");
  if (capTimer) clearTimeout(capTimer);
  capTimer = window.setTimeout(() => c.classList.remove("on"), 2600);
  if (device === "voice") add(`<p>${esc(text)}</p>`, `user ${via}`);
}

async function handleUtterance(text: string, via: "voice" | "tap" = "voice") {
  wake();
  showUtterance(text, via);
  if (brain.provider !== "scripted") return agentTurn(text);
  const steps: Step[] = route(text, state);
  for (const s of steps) {
    if ("say" in s) { alexaSays(s.say); continue; }
    const args = { ...s.args };
    if (args.optionId === "$firstOption") args.optionId = state.lastOptions[0]?.id;
    await callTool(s.tool, args, (s as any).quiet);
  }
}

// One traveller turn with a real model: ask it what to do, run the GateCue tools it picks (cards,
// confirmations and payments all go through the normal MCP paths), feed the results back, repeat.
let agentBusy: Promise<void> = Promise.resolve();
function agentTurn(text: string): Promise<void> {
  const run = agentBusy.then(() => agentLoop(text)).catch((e) => { console.error(e); alexaSays("Sorry, something went wrong on my side. Try that again?"); });
  agentBusy = run;
  return run;
}
async function agentLoop(text: string) {
  transcript.push({ role: "user", text });
  let toolTurn: HTMLElement | undefined; // the card this turn produced, if any
  for (let step = 0; step < 6; step++) {
    const pending = toolTurn ? undefined : add(THINKING, "alexa");
    document.body.classList.add("is-thinking");
    speaking(true);
    let out: { text?: string; toolCalls?: ToolCall[]; raw?: unknown; error?: string };
    try {
      const r = await fetch(new URL("/sim/agent", SERVER), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: transcript, tools: toolDefs }) });
      out = await r.json();
      if (!r.ok) throw new Error(out.error ?? `HTTP ${r.status}`);
    } catch (e: any) {
      console.error("[agent]", e?.message ?? e);
      if (transcript[transcript.length - 1]?.role === "user") transcript.pop(); // let the traveller simply try again
      const msg = "Sorry, I couldn't reach my brain just now. Try that again?";
      document.body.classList.remove("is-thinking");
      if (pending) pending.innerHTML = sayP(msg); else alexaSays(msg);
      speaking(false);
      return;
    }
    document.body.classList.remove("is-thinking");
    const said = (out.text ?? "").trim();
    const calls = out.toolCalls ?? [];
    if (said || calls.length) transcript.push({ role: "assistant", text: said || undefined, toolCalls: calls.length ? calls : undefined, raw: out.raw });
    if (said) {
      if (pending) { pending.innerHTML = sayP(said); lastTurn = pending; followups(pending, []); }
      else if (toolTurn) toolTurn.querySelector(".say-text")?.insertAdjacentHTML("afterend", sayP(said, "add"));
      else alexaSays(said);
      if (speak && "speechSynthesis" in window && (pending || toolTurn)) speechSynthesis.speak(new SpeechSynthesisUtterance(said));
    } else pending?.remove();
    if (!calls.length) { setTimeout(() => speaking(false), Math.min(5000, 60 * said.length)); return; }
    const results = [];
    for (const c of calls) {
      const silent = SILENT_TOOLS.has(c.name);
      const before = lastTurn;
      const r: any = await callTool(c.name, c.args, silent, true);
      if (!silent && lastTurn && lastTurn !== before) toolTurn = lastTurn;
      const txt = (r?.content ?? []).filter((x: any) => x.type === "text").map((x: any) => x.text).join(" ");
      results.push({ id: c.id, name: c.name, text: txt || "(no text)", data: r?.structuredContent, isError: !!r?.isError || !r });
    }
    transcript.push({ role: "tool", results });
  }
}

// ---- Elicitation, styled like an Alexa confirmation sheet -------------------------------------------
function elicit(p: any): Promise<any> {
  return new Promise((resolve) => {
    $("#caption").classList.remove("on");
    modalRoot.hidden = false;
    const done = (r: any) => { modalRoot.hidden = true; modalRoot.innerHTML = ""; resolve(r); };
    if (p.mode === "url") {
      const host = new URL(p.url).hostname;
      modalRoot.innerHTML = `<div class="sheet2" role="dialog" aria-modal="true" aria-labelledby="st"><h2 id="st">${esc(p.message)}</h2>
        <p class="sub lock">Secure page on <strong>${esc(host)}</strong>. GateCue never sees your card details.</p>
        <div class="acts"><button class="primary" id="go">Open checkout</button><button id="no">Not now</button></div></div>`;
      modalRoot.querySelector("#go")!.addEventListener("click", () => { window.open(p.url, "_blank"); done({ action: "accept" }); });
      modalRoot.querySelector("#no")!.addEventListener("click", () => done({ action: "decline" }));
      return;
    }
    const props = Object.entries<any>(p.requestedSchema?.properties ?? {});
    const fields = props.map(([k, v]) => v.type === "boolean"
      ? `<label class="check"><input type="checkbox" name="${esc(k)}"> <span>${esc(v.title ?? k)}</span></label>`
      : v.enum ? `<fieldset><legend>${esc(v.title ?? k)}</legend>${v.enum.map((e: string, i: number) => `<label class="opt"><input type="radio" name="${esc(k)}" value="${esc(e)}" ${(v.default ?? v.enum[0]) === e || (!v.default && i === 0) ? "checked" : ""}> <span>${esc(e)}</span></label>`).join("")}</fieldset>`
      : `<label>${esc(v.title ?? k)} <input name="${esc(k)}"></label>`).join("");
    modalRoot.innerHTML = `<form class="sheet2" role="dialog" aria-modal="true" aria-labelledby="st"><h2 id="st">${esc(p.message)}</h2>${fields}
      <div class="acts"><button class="primary" type="submit">Confirm</button><button type="button" id="no">Cancel</button></div></form>`;
    const form = modalRoot.querySelector("form")!;
    // A required yes/no acknowledgement must be ticked before Confirm works (no accidental "yes").
    const acks = props.filter(([, v]) => v.type === "boolean").map(([k]) => form.elements.namedItem(k) as HTMLInputElement);
    const submit = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    const sync = () => { submit.disabled = acks.some((a) => !a.checked); };
    acks.forEach((a) => a.addEventListener("change", sync)); sync();
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const content: Record<string, unknown> = {};
      for (const [k, v] of props) {
        if (v.type === "boolean") content[k] = (form.elements.namedItem(k) as HTMLInputElement).checked;
        else content[k] = (new FormData(form).get(k) as string) ?? "";
      }
      done({ action: "accept", content });
    });
    modalRoot.querySelector("#no")!.addEventListener("click", () => done({ action: "decline" }));
  });
}

// Home-screen glance: what GateCue remembers about the next trip (a silent get_trip_context call).
async function glance() {
  if (!tools.has("get_trip_context")) return;
  try {
    const r: any = await client.callTool({ name: "get_trip_context", arguments: {} }, CallToolResultSchema);
    const t = r?.structuredContent?.trips?.[0];
    const el = $("#ambTrip");
    if (!t || !el) return;
    el.innerHTML = tripGlance(t);
    el.hidden = false;
    setTimeout(() => (el.querySelector("animateMotion") as any)?.beginElement?.(), 900);
  } catch { /* the glance is optional */ }
}

async function main() {
  document.querySelectorAll<HTMLButtonElement>("[data-device]").forEach((b) => b.addEventListener("click", () => { device = b.dataset.device as Device; applyDevice(); }));
  $("#theme").addEventListener("click", () => { theme = theme === "dark" ? "light" : "dark"; applyDevice(); });
  window.addEventListener("resize", applyDevice);
  applyDevice();
  // Opening: the GateCue mark opens like a gate onto the home screen (skipped for scripted runs and voice-only).
  if (!q.get("script") && q.get("intro") !== "0" && device !== "voice") void intro(screen, $("#ambient"));
  tickClock(); setInterval(tickClock, 1000);
  document.querySelector(".sheet-tools .round")?.addEventListener("click", () => document.body.classList.toggle("history"));
  const sceneSel = $<HTMLSelectElement>("#scene");
  sceneSel.addEventListener("change", () => setScene(sceneSel.value));
  if (q.get("scene")) { sceneSel.value = q.get("scene")!; await setScene(q.get("scene")!); }
  client = new Client({ name: "gatecue-alexa-sim", version: "0.3.0" }, { capabilities: { elicitation: { form: {}, url: {} }, tasks: {} } as any });
  client.setRequestHandler(ElicitRequestSchema, async (req) => elicit(req.params));
  await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", SERVER)));
  const { tools: list } = await client.listTools();
  for (const t of list) tools.set(t.name, t);
  void glance();
  toolDefs = list.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
  if (q.get("brain") !== "scripted") {
    try { const b = await (await fetch(new URL("/sim/agent", SERVER))).json(); if (b?.provider) brain = b; } catch { /* older server: scripted */ }
  }
  document.body.dataset.brain = brain.provider;
  $("#status").textContent = `Connected to GateCue (MCP ${(client as any)._transport?.protocolVersion ?? ""}) · ${brain.provider === "scripted" ? "Scripted demo" : `Model: ${brain.label}`}`;
  $<HTMLFormElement>("#say").addEventListener("submit", (e) => { e.preventDefault(); const v = input.value.trim(); if (v) { input.value = ""; void handleUtterance(v); } });
  document.body.dataset.connected = "1";
  const script = q.get("script");
  if (script) for (const line of script.split("|")) await handleUtterance(line);
  document.body.dataset.scriptDone = "1";
}
main().catch((e) => { $("#status").textContent = `Error: ${e?.message ?? e}`; console.error(e); });
