// Checkout for URL-mode elicitation.
// With a Stripe test key: real Stripe Checkout (test mode). Without one: a local stand-in page.
import type { Express } from "express";
import { stripeEnabled, createCheckoutSession, getCheckoutSession, expireCheckoutSession } from "./stripe.js";

interface Pending { resolve: (o: { paid: boolean; via: "stripe" | "local" }) => void; timer: NodeJS.Timeout; poll?: NodeJS.Timeout; sessionId?: string }
const pending = new Map<string, Pending>();

function settle(elicitationId: string, paid: boolean, via: "stripe" | "local"): boolean {
  const p = pending.get(elicitationId);
  if (!p) return false;
  clearTimeout(p.timer);
  if (p.poll) clearInterval(p.poll);
  pending.delete(elicitationId);
  p.resolve({ paid, via });
  return true;
}

export interface StartedCheckout { url: string; done: Promise<{ paid: boolean; via: "stripe" | "local" }>; provider: "stripe" | "local" }

export async function startCheckout(p: { baseUrl: string; elicitationId: string; amountUsd: number; label: string; timeoutMs: number }): Promise<StartedCheckout> {
  let resolve!: Pending["resolve"];
  const done = new Promise<{ paid: boolean; via: "stripe" | "local" }>((r) => (resolve = r));
  const entry: Pending = {
    resolve,
    timer: setTimeout(() => {
      if (entry.sessionId) void expireCheckoutSession(entry.sessionId);
      settle(p.elicitationId, false, entry.sessionId ? "stripe" : "local");
    }, p.timeoutMs),
  };
  pending.set(p.elicitationId, entry);

  if (stripeEnabled()) {
    const s = await createCheckoutSession({ amountUsd: p.amountUsd, label: p.label, elicitationId: p.elicitationId, baseUrl: p.baseUrl });
    entry.sessionId = s.id;
    // Poll as well as relying on the redirect, so payment is noticed even if the tab is closed early.
    entry.poll = setInterval(async () => {
      try {
        const cur = await getCheckoutSession(s.id);
        if (cur.payment_status === "paid") settle(p.elicitationId, true, "stripe");
        else if (cur.status === "expired") settle(p.elicitationId, false, "stripe");
      } catch { /* keep polling */ }
    }, 3000);
    return { url: s.url, done, provider: "stripe" };
  }

  const u = new URL("/checkout", p.baseUrl);
  u.searchParams.set("e", p.elicitationId);
  u.searchParams.set("amount", p.amountUsd.toFixed(2));
  u.searchParams.set("label", p.label);
  return { url: u.toString(), done, provider: "local" };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const page = (msg: string) => `<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px"><p>${msg}</p></body>`;

export function mountCheckout(app: Express): void {
  // Local stand-in (no Stripe key).
  app.get("/checkout", (req, res) => {
    const e = String(req.query.e ?? "");
    const amount = esc(String(req.query.amount ?? ""));
    const label = esc(String(req.query.label ?? ""));
    res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width"><title>GateCue checkout (local test)</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<h1 style="font-size:20px">Test checkout</h1><p>${label}</p><p style="font-size:28px;font-weight:600">$${amount}</p>
<p style="color:#666">Local test page. No real money moves.</p>
<form method="post" action="/checkout/complete"><input type="hidden" name="e" value="${esc(e)}">
<button name="paid" value="1" style="font-size:16px;padding:10px 16px">Pay (test)</button>
<button name="paid" value="0" style="font-size:16px;padding:10px 16px">Cancel</button></form></body>`);
  });
  app.post("/checkout/complete", (req, res) => {
    const ok = settle(String(req.body?.e ?? ""), String(req.body?.paid ?? "0") === "1", "local");
    res.type("html").send(page(ok ? "Done. You can close this tab." : "This checkout has expired."));
  });

  // Stripe redirects.
  app.get("/checkout/done", async (req, res) => {
    const e = String(req.query.e ?? "");
    const sid = String(req.query.session_id ?? "");
    try {
      const s = await getCheckoutSession(sid);
      if (s.payment_status === "paid") settle(e, true, "stripe");
      res.type("html").send(page(s.payment_status === "paid" ? "Paid (Stripe test mode). You can close this tab and go back to Alexa." : "Payment not completed."));
    } catch {
      res.type("html").send(page("Couldn't confirm the payment. Go back to Alexa and try again."));
    }
  });
  app.get("/checkout/cancelled", (req, res) => {
    settle(String(req.query.e ?? ""), false, "stripe");
    res.type("html").send(page("Payment cancelled. Nothing was charged."));
  });
}
