// Sends one real plan email through Amazon SES, built exactly as the email_trip_plan tool builds it.
// Run: npm run test:email   (needs `aws login`, GC_TRAVELLER_EMAIL in .env, and that address verified in SES)
import { getTrips } from "../server/memory.js";
import { planTrip } from "../server/plan.js";
import { planEmail, sendEmail, travellerEmail, maskEmail } from "../server/mailer.js";

process.env.GC_AWS = "1";
const to = travellerEmail();
if (!to) { console.log("✗ Set GC_TRAVELLER_EMAIL in .env first."); process.exit(1); }
const trip = (await getTrips())[0];
const p = planTrip({ ...trip, timeZone: "America/Los_Angeles", driveMinutes: 29, pickupDetourMinutes: 3, checkinCutoffMinutes: trip.checkinCutoffMinutes, walkToCheckinMinutes: 5, bufferMinutes: 15, deplaneMinutes: 15, arrivalToVenueMinutes: 35 });
const mail = planEmail({ ...p, goalPlace: trip.goalPlace, goalTime: trip.goalTime, flightNumber: trip.flight.number, from: trip.flight.from, to: trip.flight.to, driveMinutes: 29, driveSource: "Amazon Location", bufferMinutes: 15, pickupStop: trip.pickupStop });
const r = await sendEmail(mail);
console.log(r.ok ? `✓ Sent "${mail.subject}" to ${maskEmail(to)} (SES message ${r.messageId})` : `✗ Not sent: ${r.reason}${r.reason === "not-verified" ? " (click the link in the AWS verification email first)" : ""}`);
