import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTaskStore, InMemoryTaskMessageQueue } from "@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js";
import { createGateCueServer } from "./gatecue.js";
import { mountCheckout } from "./checkout.js";
import { setDemoNow } from "./clock.js";
import { mountAgent } from "./agent.js";
import { mountVoice } from "./voice.js";
import { demoScheduleOn, setDisruption, clearDisruptions } from "./demo-schedule.js";
import { resetMemory } from "./memory.js";

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;

const app = express();
app.set("trust proxy", 1); // behind Caddy when hosted: rate limits see the visitor's address

// Light per-address rate limits for the endpoints that cost money (model calls, speech). No effect on local use.
function rateLimit(perMinute: number) {
  const hits = new Map<string, number[]>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const k = req.ip ?? "?", t = Date.now();
    const recent = (hits.get(k) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= perMinute) { res.status(429).json({ error: "Too many requests, try again in a minute." }); return; }
    recent.push(t); hits.set(k, recent);
    if (hits.size > 5000) hits.clear();
    next();
  };
}
app.use(cors({ origin: true, exposedHeaders: ["Mcp-Session-Id"], allowedHeaders: ["Content-Type", "mcp-session-id", "mcp-protocol-version", "last-event-id", "Authorization"] }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
mountCheckout(app);

const taskStore = new InMemoryTaskStore();
const taskMessageQueue = new InMemoryTaskMessageQueue();
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post("/mcp", async (req, res) => {
  const sid = req.header("mcp-session-id");
  try {
    let transport = sid ? transports[sid] : undefined;
    if (!transport) {
      if (sid || !isInitializeRequest(req.body)) {
        res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad request: no valid session" }, id: null });
        return;
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => { transports[id] = transport!; },
      });
      transport.onclose = () => { if (transport!.sessionId) delete transports[transport!.sessionId]; };
      const server = createGateCueServer({ taskStore, taskMessageQueue, publicBaseUrl: PUBLIC_BASE_URL });
      await server.connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
});

const sessionRequest = async (req: express.Request, res: express.Response) => {
  const sid = req.header("mcp-session-id");
  const transport = sid ? transports[sid] : undefined;
  if (!transport) { res.status(400).send("Invalid or missing session"); return; }
  await transport.handleRequest(req, res);
};
app.get("/mcp", sessionRequest);
app.delete("/mcp", sessionRequest);

// Demo mode only (GATECUE_DEMO_NOW set): move the scenario clock between filmed scenes. Not exposed as an MCP tool.
app.post("/demo/clock", (req, res) => { res.status(setDemoNow(String(req.body?.now ?? "")) ? 204 : 404).end(); });
// Demo only (built-in schedule): simulate a delay, gate change or cancellation so the watcher can be filmed reacting.
app.get("/demo/info", (_req, res) => { res.json({ demoSchedule: demoScheduleOn(), demoClock: !!process.env.GATECUE_DEMO_NOW }); });
// Demo only: back to the seeded traveller and a normal schedule, between filming takes.
app.post("/demo/reset", async (_req, res) => {
  if (!demoScheduleOn()) { res.status(404).end(); return; }
  clearDisruptions();
  await resetMemory().catch(() => {});
  res.status(204).end();
});
app.post("/demo/disrupt", (req, res) => {
  if (!demoScheduleOn()) { res.status(404).end(); return; }
  const b = req.body ?? {};
  if (b.clear) clearDisruptions();
  else if (typeof b.number === "string") setDisruption(b.number, { delayMinutes: Number(b.delayMinutes) || undefined, gate: typeof b.gate === "string" ? b.gate.slice(0, 4) : undefined, cancelled: b.cancelled === true });
  else { res.status(400).end(); return; }
  res.status(204).end();
});

// The Alexa+ simulator (our MCP host), served at /sim for local demos, and the model that drives it.
app.use("/sim/agent", rateLimit(Number(process.env.GC_AGENT_PER_MIN ?? 30)));
// A daily ceiling on model calls across everyone, so a public deployment can't run up the model bill.
const dailyCap = Number(process.env.GC_AGENT_PER_DAY ?? 2000);
let capDay = "", capUsed = 0;
app.use("/sim/agent", (req, res, next) => {
  if (req.method !== "POST") return next();
  const day = new Date().toISOString().slice(0, 10);
  if (day !== capDay) { capDay = day; capUsed = 0; }
  if (++capUsed > dailyCap) { res.status(429).json({ error: "The demo has used today's model allowance. Try again tomorrow." }); return; }
  next();
});
app.use("/sim/speak", rateLimit(Number(process.env.GC_SPEAK_PER_MIN ?? 60)));
mountAgent(app);
mountVoice(app);
app.use("/assets", express.static(new URL("../assets/", import.meta.url).pathname, { immutable: true, maxAge: "365d" }));
app.use("/sim", express.static(new URL("../dist/host/", import.meta.url).pathname));

app.get("/healthz", (_req, res) => { res.json({ ok: true }); });

app.listen(PORT, () => console.log(`GateCue MCP server on ${PUBLIC_BASE_URL}/mcp\nSimulator: ${PUBLIC_BASE_URL}/sim/`));
