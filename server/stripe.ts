// Stripe test-mode Checkout, called over plain HTTPS (no SDK needed).
const API = "https://api.stripe.com/v1";

function auth() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_")) throw new Error("Stripe is only allowed in test mode (sk_test_ key required)");
  return { Authorization: `Bearer ${key}` };
}

export function stripeEnabled(): boolean {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}

export interface CheckoutSession { id: string; url: string; payment_status: string; status: string }

export async function createCheckoutSession(p: { amountUsd: number; label: string; elicitationId: string; baseUrl: string }): Promise<CheckoutSession> {
  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(Math.round(p.amountUsd * 100)),
    "line_items[0][price_data][product_data][name]": p.label,
    success_url: `${p.baseUrl}/checkout/done?e=${encodeURIComponent(p.elicitationId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${p.baseUrl}/checkout/cancelled?e=${encodeURIComponent(p.elicitationId)}`,
    "metadata[elicitation_id]": p.elicitationId,
    "metadata[app]": "gatecue",
  });
  const r = await fetch(`${API}/checkout/sessions`, { method: "POST", headers: { ...auth(), "Content-Type": "application/x-www-form-urlencoded" }, body });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Stripe: ${j.error?.message ?? r.status}`);
  return { id: j.id, url: j.url, payment_status: j.payment_status, status: j.status };
}

export async function getCheckoutSession(id: string): Promise<CheckoutSession> {
  const r = await fetch(`${API}/checkout/sessions/${encodeURIComponent(id)}`, { headers: auth() });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Stripe: ${j.error?.message ?? r.status}`);
  return { id: j.id, url: j.url, payment_status: j.payment_status, status: j.status };
}

export async function expireCheckoutSession(id: string): Promise<void> {
  await fetch(`${API}/checkout/sessions/${encodeURIComponent(id)}/expire`, { method: "POST", headers: auth() }).catch(() => {});
}
