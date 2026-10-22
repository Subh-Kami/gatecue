// Trip-update emails through Amazon SES (v2). Same rules as the voice replies: every time carries AM or PM and
// the day, and nothing is invented: the email is built from the same plan and booking data the cards show.
// Sent only when AWS is on (GC_AWS=1) and a traveller address is configured (GC_TRAVELLER_EMAIL, in .env).
// In the SES sandbox both the sender (GC_SES_FROM, default: the traveller address) and recipient must be verified.
import { readFileSync } from "node:fs";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { fmtDayLong, fmtTime, type Step } from "./plan.js";

const TZ = "America/Los_Angeles";
let client: SESv2Client | undefined;
const ses = () => (client ??= new SESv2Client({ region: process.env.AWS_REGION ?? "us-east-1" }));

export function travellerEmail(): string | undefined { return process.env.GC_TRAVELLER_EMAIL?.trim() || undefined; }
export function emailEnabled(): boolean { return process.env.GC_AWS === "1" && !!travellerEmail(); }
// For speech: "m…12@gmail.com", so the address isn't read out in full.
export function maskEmail(e: string): string { const [u, d] = e.split("@"); return `${u.slice(0, 1)}…${u.slice(-2)}@${d}`; }

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
// "4:59 AM" -> 4:59 with a gold AM tag (PM: violet). Email-safe inline styles only.
function timeHTML(display: string, size = 15): string {
  const m = /^(.*?)\s?(AM|PM)$/i.exec(display.trim());
  if (!m) return esc(display);
  const am = m[2].toUpperCase() === "AM";
  return `${esc(m[1])}&nbsp;<span style="display:inline-block;font-size:${Math.round(size * 0.62)}px;font-weight:700;letter-spacing:.05em;padding:2px 6px;border-radius:6px;vertical-align:${Math.round(size * 0.18)}px;background:${am ? "#FFF1DC" : "#EEE9FF"};color:${am ? "#8A5200" : "#5B3FC4"}">${m[2].toUpperCase()}</span>`;
}

const header = (cid: string, alt: string) =>
  `<tr><td style="padding:0"><img src="cid:${cid}" width="600" alt="${esc(alt)}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:16px 16px 0 0"></td></tr>`;
function shell(cid: string, alt: string, body: string, foot: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#EEF2F7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:16px;font-family:-apple-system,'Segoe UI',Roboto,'Noto Sans',Arial,sans-serif;color:#0F1419">
${header(cid, alt)}
<tr><td style="padding:28px 32px 8px">${body}</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:12px;line-height:1.5;color:#5F6B7A">${foot}</td></tr>
</table>
<div style="font-family:Arial,sans-serif;font-size:11px;color:#8A96A3;padding:14px">GateCue, an Alexa+ add-on · <span style="color:#B07100">●</span> get there for what matters</div>
</td></tr></table></body></html>`;
}

export interface PlanEmailInput {
  steps: Step[]; feasible: boolean; slackMinutes: number; goalPlace: string; goalTime: string;
  flightNumber: string; from: string; to: string; driveMinutes: number; driveSource: string; bufferMinutes: number; pickupStop?: string;
}
export function planEmail(p: PlanEmailInput) {
  const leave = p.steps[0];
  const day = fmtDayLong(leave.at, TZ);
  const subject = `Leave at ${leave.display}, ${day}: ${p.flightNumber} to ${p.to}`;
  const status = p.feasible
    ? `<span style="color:#1B7A45">You reach ${esc(p.goalPlace)} ${p.slackMinutes} minutes early.</span>`
    : `<span style="color:#B3261E">This plan gets you to ${esc(p.goalPlace)} ${-p.slackMinutes} minutes late.</span>`;
  const rows = p.steps.map((s) => `<tr>
    <td style="padding:9px 0;border-top:1px solid #E3E7ED;font-size:15px;white-space:nowrap;width:120px;font-variant-numeric:tabular-nums;${s.id === "cutoff" ? "color:#9A5B00;font-weight:600" : ""}">${timeHTML(s.display)}</td>
    <td style="padding:9px 0;border-top:1px solid #E3E7ED;font-size:15px;${s.id === "cutoff" ? "color:#9A5B00;font-weight:600" : ""}">${esc(s.label)}${s.note ? `<div style="font-size:12px;color:#5F6B7A;font-weight:400">${esc(s.note)}</div>` : ""}</td></tr>`).join("");
  const body = `<div style="font-size:13px;color:#5F6B7A;text-transform:uppercase;letter-spacing:.08em">${esc(day)}</div>
<div style="font-size:16px;margin-top:6px">Leave home at</div>
<div style="font-size:44px;line-height:1.1;font-weight:500;margin:2px 0 6px">${timeHTML(leave.display, 44)}</div>
<div style="font-size:15px;margin-bottom:18px">${status}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
  const foot = `Drive ${p.pickupStop ? `with the stop at ${esc(p.pickupStop)} ` : ""}about ${p.driveMinutes} minutes${p.driveSource === "Amazon Location" ? " in traffic (Amazon Location)" : " (estimate)"}. You asked to be at check-in ${p.bufferMinutes} minutes before it closes.<br>Times are Pacific time (${TZ}).`;
  const text = [`${day}`, `Leave home at ${leave.display}.`, p.feasible ? `You reach ${p.goalPlace} ${p.slackMinutes} minutes early.` : `This plan gets you to ${p.goalPlace} ${-p.slackMinutes} minutes late.`, "", ...p.steps.map((s) => `${s.display.padEnd(9)} ${s.label}${s.note ? ` · ${s.note}` : ""}`), "", `Drive about ${p.driveMinutes} minutes. Times are Pacific time.`, "", "GateCue, an Alexa+ add-on"].join("\n");
  return { subject, html: shell("plan", "Your travel day", body, foot), text, image: "plan" as const };
}

export type BookingEmailInput =
  | { kind: "ride"; pickupTime: string; pickup: string; stop?: string; dropoff: string; priceUsd: number; card: string; rideId: string }
  | { kind: "flight"; flightNumber: string; from: string; to: string; departure: string; arrival: string; fareUsd: number; confirmation: string; refundable: boolean };
export function bookingEmail(b: BookingEmailInput) {
  if (b.kind === "ride") {
    const t = fmtTime(b.pickupTime, TZ), day = fmtDayLong(b.pickupTime, TZ);
    const subject = `Ride booked: pickup ${t}, ${day}`;
    const body = `<div style="font-size:13px;color:#1B7A45;text-transform:uppercase;letter-spacing:.08em">Ride booked</div>
<div style="font-size:16px;margin-top:6px">Pickup ${esc(day)} at</div>
<div style="font-size:44px;line-height:1.1;font-weight:500;margin:2px 0 14px">${timeHTML(t, 44)}</div>
<div style="font-size:15px;line-height:1.7">${esc(b.pickup)}<br>${b.stop ? `↓ pick up at ${esc(b.stop)}<br>` : ""}↓ ${esc(b.dropoff)}</div>`;
    const foot = `$${b.priceUsd.toFixed(2)} charged to your ${esc(b.card)}. Ride ${esc(b.rideId)}.<br>Times are Pacific time (${TZ}).`;
    const text = `Ride booked\nPickup ${day} at ${t}\n${b.pickup}${b.stop ? ` -> ${b.stop}` : ""} -> ${b.dropoff}\n$${b.priceUsd.toFixed(2)} on your ${b.card}. Ride ${b.rideId}.`;
    return { subject, html: shell("ride", "Your ride", body, foot), text, image: "ride" as const };
  }
  const dep = fmtTime(b.departure, TZ), arr = fmtTime(b.arrival, TZ), day = fmtDayLong(b.departure, TZ);
  const subject = `You're booked: ${b.flightNumber} ${b.from} to ${b.to}, ${dep} ${day}`;
  const body = `<div style="font-size:13px;color:#1B7A45;text-transform:uppercase;letter-spacing:.08em">You're booked</div>
<div style="font-size:16px;margin-top:6px">${esc(day)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0 4px"><tr>
<td style="font-size:34px;letter-spacing:.04em">${esc(b.from)}<div style="font-size:17px;letter-spacing:0">${timeHTML(dep, 17)}</div></td>
<td align="center" style="font-size:13px;color:#5F6B7A">${esc(b.flightNumber)}<div style="font-size:20px;color:#0F1419">✈</div></td>
<td align="right" style="font-size:34px;letter-spacing:.04em">${esc(b.to)}<div style="font-size:17px;letter-spacing:0">${timeHTML(arr, 17)}</div></td></tr></table>
<div style="border-top:2px dashed #E3E7ED;margin:16px 0 12px"></div>
<div style="font-size:15px">Confirmation <b style="letter-spacing:.12em">${esc(b.confirmation)}</b> · $${b.fareUsd.toFixed(2)} paid · ${b.refundable ? "refundable" : "non-refundable"}</div>`;
  const foot = `Times are Pacific time (${TZ}).`;
  const text = `You're booked\n${b.flightNumber} ${b.from} ${dep} -> ${b.to} ${arr}, ${day}\nConfirmation ${b.confirmation}. $${b.fareUsd.toFixed(2)} paid, ${b.refundable ? "refundable" : "non-refundable"}.`;
  return { subject, html: shell("flight", "Your flight", body, foot), text, image: "flight" as const };
}

// A short alert (delay, gate change, cancellation): same look, one message.
export function alertEmail(subject: string, text: string) {
  const body = `<div style="font-size:13px;color:#9A5B00;text-transform:uppercase;letter-spacing:.08em">Flight update</div>
<div style="font-size:22px;line-height:1.35;margin:8px 0 4px">${esc(text)}</div>`;
  return { subject, html: shell("plan", "Your trip", body, `Times are Pacific time (${TZ}).`), text: `${text}\n\nGateCue, an Alexa+ add-on`, image: "plan" as const };
}

export interface SendResult { ok: boolean; messageId?: string; reason?: string }
export async function sendEmail(mail: { subject: string; html: string; text: string; image: "plan" | "ride" | "flight" }): Promise<SendResult> {
  const to = travellerEmail();
  if (!emailEnabled() || !to) return { ok: false, reason: "not-configured" };
  const from = process.env.GC_SES_FROM?.trim() || to;
  let img: Uint8Array | undefined;
  try { img = readFileSync(new URL(`../assets/email/${mail.image}.jpg`, import.meta.url)); } catch { /* send without the picture */ }
  try {
    const r = await ses().send(new SendEmailCommand({
      FromEmailAddress: `GateCue <${from}>`,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: mail.subject, Charset: "UTF-8" },
          Body: { Html: { Data: img ? mail.html : mail.html.replace(/<tr><td style="padding:0"><img[^>]*><\/td><\/tr>/, ""), Charset: "UTF-8" }, Text: { Data: mail.text, Charset: "UTF-8" } },
          ...(img ? { Attachments: [{ RawContent: img, FileName: `${mail.image}.jpg`, ContentType: "image/jpeg", ContentDisposition: "INLINE", ContentId: mail.image, ContentTransferEncoding: "BASE64" }] } : {}),
        },
      },
    }));
    return { ok: true, messageId: r.MessageId };
  } catch (e) {
    const err = e as Error;
    console.warn(`[mailer] ${err.name}: ${err.message}`);
    return { ok: false, reason: /not verified/i.test(err.message) ? "not-verified" : err.name };
  }
}
