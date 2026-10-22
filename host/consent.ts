// Consent gate for model-driven turns: tools that act on the traveller's behalf (open a ride app, pay for a
// flight, send an email, start watching, change saved preferences) run only when the traveller's latest
// message asks for that action, or says yes to Alexa offering it. A model that "helpfully" chains a
// booking onto a plan gets a refusal it can turn into a one-line offer instead.
const ASKS: Record<string, RegExp> = {
  book_ride: /\b(ride|rides|cab|taxi|uber|lyft|car|pick me up|pickup|pick-up|drive me|lift)\b/i,
  book_flight: /\b(book|buy|purchase|reserve|pay)\b/i,
  email_trip_plan: /\b(e-?mail|mail|send|share|inbox)\b/i,
  watch_trip: /\b(watch|keep an eye|keep track|track|monitor|remind|alert|tell me when|let me know|nudge|heads up)\b/i,
  update_preferences: /\b(prefer|preference|always|buffer|from now on|usually|remember|i like|i'd like)\b/i,
  // A plan (re)drawn on screen is only for a message about the day, the trip or the meeting.
  plan_trip: /\b(plan|planning|meeting|trip|day|leave|get me|get there|need to be|when should|what time|schedule|tomorrow|tonight|morning|flight|buffer|on time)\b/i,
};
// What an offer from Alexa has to mention for a plain "yes" to count as asking for it.
const OFFER: Record<string, RegExp> = {
  book_ride: /\bride\b/i,
  book_flight: /\b(book|flight)\b/i,
  email_trip_plan: /\be-?mail\b/i,
  watch_trip: /\b(watch|keep an eye|let you know|tell you)\b/i,
  update_preferences: /\b(prefer|buffer|remember)\b/i,
  plan_trip: /\b(plan|leave)\b/i,
};
const YES = /^\s*(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|please|sounds good|confirm|absolutely|of course)\b/i;

export const ACTION_TOOLS = new Set(Object.keys(ASKS));

export function consent(tool: string, utterance: string, lastAlexa = ""): { ok: true } | { ok: false; reason: string } {
  const asks = ASKS[tool];
  if (!asks) return { ok: true };
  if (asks.test(utterance)) return { ok: true };
  if (YES.test(utterance) && OFFER[tool].test(lastAlexa)) return { ok: true };
  return {
    ok: false,
    reason: `Not done: the traveller didn't ask for ${tool} in their last message. Don't call it again this turn. If it would help, offer it in one short question.`,
  };
}

// "the 6 o'clock", "the 6:30", "the 6 flight": a clock time with no AM or PM. GateCue's promise is that
// this never gets booked blind, so the host makes the model search around that time (both halves of the
// day side by side) before it may review or book anything in that turn.
export function bareClock(utterance: string): string | null {
  const t = utterance.toLowerCase().replace(/[’']/g, "'");
  const m = t.match(/\b(\d{1,2}(?::\d{2})?)\s*o'?clock\b/) ?? t.match(/\bthe\s+(\d{1,2}:\d{2})\b/) ?? t.match(/\bthe\s+(\d{1,2})(?=\s+(?:flight|one)\b|\s*[.!?]?\s*$)/);
  if (!m) return null;
  const after = t.slice((m.index ?? 0) + m[0].length);
  if (/^\s*(a\.?m\.?|p\.?m\.?)\b/.test(after) || /\b(morning|evening|tonight|afternoon)\b/.test(t)) return null;
  return m[1];
}
