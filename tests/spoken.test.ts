// Only the reply itself is spoken: model reasoning never reaches the Echo Show.
import assert from "node:assert/strict";
import { spokenReply } from "../server/agent.ts";
assert.equal(spokenReply("<thinking>The user wants a plan.</thinking> Leave at 5:12 AM."), "Leave at 5:12 AM.");
assert.equal(spokenReply("<thinking>still thinking about the tool result"), "");
assert.equal(spokenReply("Want me to book the ride?"), "Want me to book the ride?");
assert.equal(spokenReply("However, the instructions say that when a tool returns, its text is already spoken. The user hasn't said anything new."), "");
assert.equal(spokenReply("The assistant should now tell the user that the trip is being watched."), "");
assert.equal(spokenReply("<response>I've re-planned with your new buffer.</response>"), "I've re-planned with your new buffer.");
assert.equal(spokenReply("Okay, I'll keep an eye on your flight."), "Okay, I'll keep an eye on your flight.");
assert.equal(spokenReply("It just couldn't handle the *copter*-ation!"), "It just couldn't handle the copter-ation!");
console.log("spoken.test.ts: all assertions passed");
