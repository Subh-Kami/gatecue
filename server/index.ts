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

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;

const app = express();
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

// The Alexa+ simulator (our MCP host), served at /sim for local demos, and the model that drives it.
mountAgent(app);
app.use("/assets", express.static(new URL("../assets/", import.meta.url).pathname, { immutable: true, maxAge: "365d" }));
app.use("/sim", express.static(new URL("../dist/host/", import.meta.url).pathname));

app.get("/healthz", (_req, res) => { res.json({ ok: true }); });

app.listen(PORT, () => console.log(`GateCue MCP server on ${PUBLIC_BASE_URL}/mcp\nSimulator: ${PUBLIC_BASE_URL}/sim/`));
