// Alexa's voice in the simulator: replies spoken by Amazon Polly (generative "Ruth", falling back to neural "Joanna").
// In real Alexa+, Alexa speaks GateCue's replies itself; this only makes the simulator sound like the real thing.
// Needs AWS (GC_AWS=1). Without it the endpoint answers 503 and the simulator uses the browser's own voice.
import type { Express } from "express";
import { createHash } from "node:crypto";
import { PollyClient, SynthesizeSpeechCommand, type Engine, type VoiceId } from "@aws-sdk/client-polly";

let client: PollyClient | undefined;
const polly = () => (client ??= new PollyClient({ region: process.env.AWS_REGION ?? "us-east-1" }));
const cache = new Map<string, Buffer>(); // same sentence, same audio: replays cost nothing
const MAX_CACHE = 200, MAX_CHARS = 600;
const VOICES: Array<[Engine, VoiceId]> = [["generative", "Ruth"], ["neural", "Joanna"]];
let working: [Engine, VoiceId] | undefined;

export async function synthesize(text: string): Promise<Buffer> {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  const k = createHash("sha1").update(clean).digest("hex");
  const hit = cache.get(k);
  if (hit) return hit;
  let lastErr: unknown;
  for (const [engine, voice] of working ? [working] : VOICES) {
    try {
      const r = await polly().send(new SynthesizeSpeechCommand({ Text: clean, OutputFormat: "mp3", Engine: engine, VoiceId: voice, SampleRate: "24000" }));
      const audio = Buffer.from(await r.AudioStream!.transformToByteArray());
      working = [engine, voice];
      if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
      cache.set(k, audio);
      return audio;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

export function mountVoice(app: Express) {
  app.post("/sim/speak", async (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) { res.status(400).end(); return; }
    if (process.env.GC_AWS !== "1") { res.status(503).json({ error: "voice off" }); return; }
    try {
      const audio = await synthesize(text);
      res.set({ "content-type": "audio/mpeg", "cache-control": "no-store", "x-voice": working?.join(":") ?? "" }).send(audio);
    } catch (e) {
      console.warn(`[voice] ${(e as Error).name}: ${(e as Error).message}`);
      res.status(503).json({ error: (e as Error).name });
    }
  });
}
