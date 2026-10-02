# Friction log (running)

Format follows chris-trag/friction-log-guide: task, steps, expected vs actual, severity, time lost, workaround, suggestion.

## 1. Which MCP spec version does Alexa+ speak?
- **Task:** Pick the MCP protocol version for an Alexa+ add-on.
- **Steps:** Read the MCP Toolkit overview, then the client lifecycle page.
- **Expected:** One version across the docs.
- **Actual:** The overview says the toolkit targets spec 2025-11-25. The client lifecycle page's example initialize request and response both show `"protocolVersion": "2025-03-26"`.
- **Severity:** Medium. A builder can pick the wrong SDK line.
- **Workaround:** Followed the hackathon rules (2025-11-25) and verified the negotiated version in an end-to-end test.
- **Suggestion:** Update the lifecycle example to 2025-11-25 and state the supported range on that page.
- Sources: https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-overview.html, https://developer.amazon.com/docs/alexaplus/add-ons/mcp-toolkit-client-lifecycle.html

## 2. MCP Apps 2.0 no longer works with the 2025-11-25 SDK line
- **Task:** Add MCP Apps cards to a 2025-11-25 server.
- **Steps:** `npm i @modelcontextprotocol/ext-apps` pulls 2.0.0 (released Sep 17, 2026).
- **Expected:** Works with `@modelcontextprotocol/sdk` 1.x, which is the 2025-11-25 line.
- **Actual:** 2.0.0 peers on `@modelcontextprotocol/core|client|server` ^2.0.0 (the 2026-07-28 line). 1.7.5 peers on `@modelcontextprotocol/sdk` ^1.29.0.
- **Severity:** Medium. Silent version skew for anyone targeting Alexa+.
- **Workaround:** Pinned ext-apps 1.7.5.
- **Suggestion:** Alexa+ docs should name the exact SDK and ext-apps versions to pin.

## 3. Gated Alexa+ tools look available from setup pages
- **Task:** Test an add-on in the Alexa+ Web Simulator.
- **Actual:** The MCP Toolkit, CLI and Web Simulator are preview-only for select partners. The hackathon FAQ notes this is "sometimes missing from individual setup-guide pages."
- **Severity:** High for newcomers (time spent trying to install `@alexa-ai/cli`).
- **Workaround:** Built our own MCP Apps host that plays Alexa+'s role.
- **Suggestion:** A preview banner on every toolkit page, and a public local inspector for MCP Apps rendering.

## 4. Visual Foundations gives background tokens but no text or accent tokens
- **Task:** Build cards that match Alexa+ on Echo Show in dark and light mode.
- **Steps:** Read Visual Foundations; copied the type, spacing, radius and icon tokens and the four background colours.
- **Expected:** Foreground tokens (primary, secondary, disabled text; accent; success/error) with contrast already checked.
- **Actual:** Only card, inner-card and two button background colours are given. Builders pick their own text colours and must self-check the 4.5:1 rule from the Accessibility page.
- **Severity:** Medium. Every add-on will look slightly different, and some will fail contrast.
- **Workaround:** Chose our own foreground colours and verified every pairing with a WCAG contrast script (all >= 4.77:1).
- **Suggestion:** Publish the full Alexa+ colour token set, or a downloadable CSS token file.

## 5. deviceClass values are not listed
- **Task:** Size cards per device from `hostContext.deviceClass`, which the Layout page says "wins outright".
- **Actual:** The page never lists the possible `deviceClass` values or their sizes; Visual Foundations separately says Echo Show 8/15 render at 1280x800 with zoom 1.667.
- **Severity:** Low-medium. Guessing the strings means the zoom rule may silently not apply.
- **Workaround:** Assumed `echo-show-8`, `echo-show-15`, `mobile`, `web`, with a fallback of zoom 1.
- **Suggestion:** A table of deviceClass values with viewport sizes and zoom.

## 6. Amazon Bedrock blocked on a new account, with no self-serve path
- **Task:** Call any Bedrock model (Amazon Nova 2 Lite in the playground, then Claude Haiku 4.5) from a new account in us-east-1.
- **Steps:** Opened the Bedrock playground and ran a one-line prompt; submitted the Anthropic first-time-use form; opened a support case.
- **Expected:** Serverless models work on first use (Bedrock now enables them on first invocation), or the console says what to do.
- **Actual:** Every runtime call returns `ValidationException: Operation not allowed`, even Nova. The Anthropic form says "Your account is not authorized to perform this action. Please create a support case." The support case took a week to reach the review team (case opened Sep 24, "submitted for review" Oct 2).
- **Severity:** High. The AWS Builder mini-challenge names Bedrock first, and the hackathon credits are meant for it.
- **Workaround:** Built the brain switchable (Bedrock Converse or another provider with one setting) and shipped a scripted demo meanwhile.
- **Suggestion:** Say *why* in the error (new-account restriction, region, payment verification) and give hackathon accounts a pre-cleared path.

## 7. SES sandbox emails from a free-mail address land in spam
- **Task:** Send trip emails from the SES sandbox to the traveller's own verified Gmail address.
- **Actual:** Delivered in a second, but to Spam: SPF and DKIM pass for amazonses.com, DMARC fails because From is gmail.com. Gmail shows "via amazonses.com".
- **Severity:** Low for a demo, high for anyone who expects "verified identity" to mean "lands in the inbox".
- **Workaround:** Marked "Not spam" and added a Gmail filter for the demo.
- **Suggestion:** When verifying a free-mail address, the SES console could warn that DMARC alignment will fail and point to domain verification with Easy DKIM.

## 8. `aws login` opens the default browser, where the passkey may not live
- **Task:** Get CLI credentials with the new `aws login`.
- **Actual:** The root user's passkey was registered in a different browser; the default browser could only say "you canceled the passkey authentication". Clicking the active-session tile in the other browser did nothing because the redirect goes to 127.0.0.1.
- **Workaround:** `aws login --remote` (paste a code back into the terminal) worked first time.
- **Suggestion:** On a passkey failure, suggest `--remote` in the CLI output.
