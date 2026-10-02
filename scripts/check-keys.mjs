// Checks that the keys in .env work. Prints only status codes, never the keys.
const s = await fetch("https://api.stripe.com/v1/balance", { headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` } });
const sb = await s.json().catch(() => ({}));
console.log("Stripe:", s.status, s.ok ? `ok (livemode=${sb.livemode})` : (sb.error?.type ?? "error"));
const r = await fetch("https://aerodatabox.p.rapidapi.com/airports/iata/SEA", {
  headers: { "X-RapidAPI-Key": process.env.RAPIDAPI_KEY ?? "", "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" },
});
const rb = await r.json().catch(() => ({}));
console.log("AeroDataBox:", r.status, r.ok ? `ok (${rb.fullName ?? rb.shortName ?? "airport found"}, tz ${rb.timeZone ?? "?"})` : (rb.message ?? "error"));
console.log("RapidAPI units left this month:", r.headers.get("x-ratelimit-requests-remaining") ?? r.headers.get("x-ratelimit-units-remaining") ?? "n/a");
