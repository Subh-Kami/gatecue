// The simulator's "brain": plays the Alexa+ model that decides which GateCue tools to call.
// GateCue itself is a plain MCP server; any model can drive it. This endpoint lets the simulator
// switch models with one setting:
//   GC_BRAIN=anthropic  Claude via the Anthropic API (ANTHROPIC_API_KEY)          GC_MODEL default claude-haiku-4-5
//   GC_BRAIN=bedrock    Any Bedrock Converse model (Nova, or Claude on Bedrock)   GC_MODEL default us.amazon.nova-2-lite-v1:0
//   GC_BRAIN=scripted   No model: the simulator's scripted demo router
// Default: anthropic when ANTHROPIC_API_KEY is set, otherwise scripted.
// The endpoint is stateless: the simulator sends the whole conversation each time.
import type { Express } from "express";
import { COVERAGE } from "./airports.js";
import { BedrockRuntimeClient, ConverseCommand, type Message as BrMessage, type ContentBlock as BrBlock, type Tool as BrTool } from "@aws-sdk/client-bedrock-runtime";
import { now } from "./clock.js";
import { fmtDayLong, fmtTime } from "./plan.js";

export interface ToolDef { name: string; description?: string; inputSchema: Record<string, unknown> }
export interface ToolCall { id: string; name: string; args: Record<string, unknown> }
export interface ToolResult { id: string; name: string; text: string; data?: unknown; isError?: boolean }
export type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text?: string; toolCalls?: ToolCall[]; raw?: { provider: string; content: unknown } }
  | { role: "tool"; results: ToolResult[] };
export interface TurnOut { text: string; toolCalls: ToolCall[]; raw?: { provider: string; content: unknown }; usage?: { input: number; output: number } }

export interface Brain { provider: "anthropic" | "bedrock" | "scripted"; model?: string; label: string; turn?(system: string, msgs: Msg[], tools: ToolDef[]): Promise<TurnOut> }

const TZ = "America/Los_Angeles";
const MAX_RESULT_CHARS = 6000;

// "2026-10-15" in Seattle, `days` after `at`; and Seattle's UTC offset at that moment ("-07:00").
function localDate(at: Date, days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at.getTime() + days * 86_400_000));
}
function weekday(at: Date, days: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long" }).format(new Date(at.getTime() + days * 86_400_000));
}
function utcOffset(at: Date): string {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT-8";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return m ? `${m[1]}${m[2].padStart(2, "0")}:${m[3] ?? "00"}` : "-08:00";
}

export function systemPrompt(at: Date = now()): string {
  return [
    "You are Alexa+, answering through the GateCue add-on, which gets a traveller from home to the gate in time for what actually matters.",
    `It is now ${fmtTime(at, TZ)} on ${fmtDayLong(at, TZ)}, ${localDate(at, 0).slice(0, 4)} (${localDate(at, 0)}), Seattle time (${TZ}, UTC${utcOffset(at)}). Tomorrow is ${localDate(at, 1)}. The next days: ${[1, 2, 3, 4, 5, 6, 7].map((d) => `${weekday(at, d)} ${localDate(at, d)}`).join(", ")}. Write times as ISO 8601 with that offset, for example ${localDate(at, 1)}T11:00:00${utcOffset(at)}.`,
    "",
    "How to talk:",
    "- Everything you say is spoken aloud on an Echo Show. Use one or two short sentences. No markdown, lists, emoji or URLs.",
    "- Always say AM or PM, and the day when it isn't today.",
    "",
    "How to use GateCue:",
    "- Whenever the traveller mentions a trip, flight or meeting, call get_trip_context first. If the saved trip matches what they said (same city and day), use it: plan_trip with it, or search_flights with its airports and goal. Don't ask for things it already knows.",
    "- Never invent times, flights, prices, gates or refund rules. Use only what the tools return.",
    "- Do only what the traveller asked for in their latest message. Never book a ride or flight, send an email, start watching or change preferences unless they asked for it just now (or said yes when you offered it). After plan_trip, stop: the card already offers the next steps.",
    "- When a tool returns, its text is already spoken to the traveller with its card. Don't repeat or rephrase it.",
    "- When you call no tool, always answer in words.",
    "- To plan the day of the saved trip, call plan_trip with it, including its pickupStop if it has one. To book a ride, use the leave time from plan_trip as pickupTime; the ride goes to the departure airport.",
    "- Only for a trip that isn't saved (another city or day, \"I need to be in Los Angeles by 2 PM Friday\"), call search_flights from the traveller's home airport (SEA) to the destination airport with that goal, and stop so they can choose. When they have picked and booked a flight, or say they already have one, call plan_trip with it.",
    "- If a tool says no flights were found, tell the traveller and offer the next step; don't retry with made-up times.",
    `- GateCue covers flights between these West Coast airports only: ${COVERAGE}. Use their IATA codes. For any other destination (Paris, New York, another country), don't call tools: say in one sentence that GateCue plans West Coast trips today and other time zones are coming, and offer what it can do.`,
    "- GateCue doesn't book hotels, trains or rental cars; say so briefly.",
    "- If a flight is missed or cancelled, call search_flights with the trip's airports and goal and excludeFlight set to that flight; if they ask for other flights, the same without excludeFlight. Then stop so they can choose from the card. Call review_flight only when they pick a flight or name a time.",
    "- If they name a clock time without AM or PM (like 'the 6:30'), call search_flights with departsAround set to it, then review_flight on the flight that matches, so they see whether it's morning or evening.",
    "- Before paying for any flight, call review_flight. Call book_flight only after the traveller clearly says to book that reviewed flight. book_flight and book_ride ask for confirmation themselves, so don't ask twice.",
    "- When they ask you to email, send or share the plan, call email_trip_plan. Bookings are emailed automatically when email is set up.",
    "- When they ask you to watch the time or keep an eye on things, call watch_trip with checkinCloses from the trip context, walkMinutes 6, and the trip's flightNumber, flightDate (YYYY-MM-DD), goalTime and goalPlace so delays and gate changes are caught too.",
    "- When they state a lasting preference (\"I like 20 minutes of buffer\"), save it with update_preferences, then re-plan if a plan is on screen.",
    "- If something has nothing to do with travel (weather, music, trivia), answer briefly and kindly from what you know, without tools. Never make up live facts such as today's weather; say you can't check that here.",
    "- Small talk gets a warm, one-line answer: thanks gets \"You're welcome\", a request for a joke gets a short clean joke (travel jokes are perfect). Don't steer back to bookings unless they ask.",
    "- If they just say yes, no or okay and you hadn't asked anything, ask in one short sentence what they'd like to do.",
    "- When they ask to see flights, show the list with search_flights; review_flight is for one flight they picked.",
  ].join("\n");
}

const renderResult = (r: ToolResult) => {
  const data = r.data === undefined ? "" : `\nData: ${JSON.stringify(r.data)}`;
  const s = `${r.isError ? "Error: " : ""}${r.text}${data}`;
  return s.length > MAX_RESULT_CHARS ? `${s.slice(0, MAX_RESULT_CHARS)}…` : s;
};

// MCP tool schemas are JSON Schema; drop keys some model APIs reject.
function cleanSchema(s: Record<string, unknown>): Record<string, unknown> {
  const { $schema, ...rest } = s as any;
  void $schema;
  return { type: "object", properties: {}, ...rest };
}

// Keep the conversation small: drop whole exchanges from the front, never splitting a tool call from its result.
export function trimHistory(msgs: Msg[], max = 40): Msg[] {
  if (msgs.length <= max) return msgs;
  let start = msgs.length - max;
  while (start < msgs.length && msgs[start].role !== "user") start++;
  return msgs.slice(start);
}

// ---- Anthropic Messages API ----------------------------------------------------------------------
function anthropicBrain(model: string): Brain {
  return {
    provider: "anthropic", model, label: `${model} (Anthropic API)`,
    async turn(system, msgs, tools) {
      const messages: Array<{ role: "user" | "assistant"; content: any[] }> = [];
      const push = (role: "user" | "assistant", blocks: any[]) => {
        const last = messages[messages.length - 1];
        if (last && last.role === role) last.content.push(...blocks); else messages.push({ role, content: blocks });
      };
      for (const m of msgs) {
        if (m.role === "user") push("user", [{ type: "text", text: m.text }]);
        else if (m.role === "tool") push("user", m.results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: renderResult(r), ...(r.isError ? { is_error: true } : {}) })));
        else if (m.raw?.provider === "anthropic") push("assistant", m.raw.content as any[]);
        else push("assistant", [...(m.text ? [{ type: "text", text: m.text }] : []), ...(m.toolCalls ?? []).map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args }))]);
      }
      const res = await fetch(`${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model, max_tokens: 1024, system, messages,
          tools: tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: cleanSchema(t.inputSchema) })),
        }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${body?.error?.type ?? "error"}: ${body?.error?.message ?? ""}`);
      const content: any[] = body.content ?? [];
      return {
        text: spokenReply(content.filter((b) => b.type === "text").map((b) => b.text).join(" ")),
        toolCalls: content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input ?? {} })),
        raw: { provider: "anthropic", content },
        usage: { input: body.usage?.input_tokens ?? 0, output: body.usage?.output_tokens ?? 0 },
      };
    },
  };
}

// What the model "says" is spoken on an Echo Show, so only the reply itself may get through. Some models
// (Nova among them) put their reasoning in the text, in <thinking> tags or as plain prose about "the user"
// and "the assistant". Strip the tags; drop anything that still reads as reasoning about the conversation.
export function spokenReply(raw: string): string {
  let t = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, " ").replace(/<thinking>[\s\S]*$/i, " ");
  t = t.replace(/<\/?(response|answer|reply|output)>/gi, " ").replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim();
  const reasoning = /\b(the (user|assistant|traveller)('s)? (last|previous|said|asked|hasn't|has|needs|should|wants)|the instructions|tool (call|result)s?|according to the (instructions|system)|conversation history)\b/i;
  if (reasoning.test(t)) return "";
  return t;
}

// ---- Amazon Bedrock Converse (Nova, Claude on Bedrock, ...) ---------------------------------------
function bedrockBrain(model: string): Brain {
  const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
  return {
    provider: "bedrock", model, label: `${model} (Amazon Bedrock)`,
    async turn(system, msgs, tools) {
      const messages: BrMessage[] = [];
      const push = (role: "user" | "assistant", blocks: BrBlock[]) => {
        const last = messages[messages.length - 1];
        if (last && last.role === role) last.content!.push(...blocks); else messages.push({ role, content: blocks });
      };
      for (const m of msgs) {
        if (m.role === "user") push("user", [{ text: m.text }]);
        else if (m.role === "tool") push("user", m.results.map((r) => ({ toolResult: { toolUseId: r.id, content: [{ text: renderResult(r) }], status: r.isError ? "error" : "success" } }) as BrBlock));
        else if (m.raw?.provider === "bedrock") push("assistant", m.raw.content as BrBlock[]);
        else push("assistant", [...(m.text ? [{ text: m.text }] : []), ...(m.toolCalls ?? []).map((c) => ({ toolUse: { toolUseId: c.id, name: c.name, input: c.args as any } }) as BrBlock)]);
      }
      const toolSpecs: BrTool[] = tools.map((t) => ({ toolSpec: { name: t.name, description: t.description ?? t.name, inputSchema: { json: cleanSchema(t.inputSchema) as any } } }));
      const r = await client.send(new ConverseCommand({
        modelId: model, system: [{ text: system }], messages,
        ...(toolSpecs.length ? { toolConfig: { tools: toolSpecs } } : {}),
        inferenceConfig: { maxTokens: 1024 },
      }));
      // Keep only the spoken reply in text blocks, in what we show and in the history we send back next time.
      const content = (r.output?.message?.content ?? [])
        .filter((b) => !(b as any).reasoningContent)
        .map((b) => (b.text !== undefined ? { text: spokenReply(b.text) } : b))
        .filter((b) => b.text === undefined || b.text);
      return {
        text: content.map((b) => b.text ?? "").join(" ").trim(),
        toolCalls: content.filter((b) => b.toolUse).map((b) => ({ id: b.toolUse!.toolUseId!, name: b.toolUse!.name!, args: (b.toolUse!.input ?? {}) as Record<string, unknown> })),
        raw: { provider: "bedrock", content },
        usage: { input: r.usage?.inputTokens ?? 0, output: r.usage?.outputTokens ?? 0 },
      };
    },
  };
}

export function selectBrain(env = process.env): Brain {
  const want = (env.GC_BRAIN ?? (env.ANTHROPIC_API_KEY ? "anthropic" : "scripted")).toLowerCase();
  if (want === "anthropic" && env.ANTHROPIC_API_KEY) return anthropicBrain(env.GC_MODEL ?? "claude-haiku-4-5");
  if (want === "bedrock") return bedrockBrain(env.GC_MODEL ?? "us.amazon.nova-2-lite-v1:0");
  if (want === "anthropic") console.warn("[agent] GC_BRAIN=anthropic but ANTHROPIC_API_KEY is not set; using the scripted router.");
  return { provider: "scripted", label: "scripted demo router" };
}

export function mountAgent(app: Express, brain: Brain = selectBrain()) {
  console.log(`Brain: ${brain.label}`);
  app.get("/sim/agent", (_req, res) => { res.json({ provider: brain.provider, model: brain.model, label: brain.label }); });
  app.post("/sim/agent", async (req, res) => {
    if (!brain.turn) { res.status(409).json({ error: "scripted" }); return; }
    const msgs = Array.isArray(req.body?.messages) ? (req.body.messages as Msg[]) : [];
    const tools = Array.isArray(req.body?.tools) ? (req.body.tools as ToolDef[]) : [];
    if (!msgs.length) { res.status(400).json({ error: "messages required" }); return; }
    const started = Date.now();
    try {
      const out = await brain.turn(systemPrompt(), trimHistory(msgs), tools);
      console.log(`[agent] ${brain.provider} ${Date.now() - started}ms in=${out.usage?.input ?? "?"} out=${out.usage?.output ?? "?"} -> ${out.toolCalls.map((c) => c.name).join(", ") || "reply"}`);
      res.json(out);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error(`[agent] ${brain.provider} failed: ${(e as Error).name}: ${msg}`);
      res.status(502).json({ error: msg.slice(0, 300) });
    }
  });
}
