# GateCue art direction

Goal: every card reads like a premium travel product, and still looks native on an Alexa+ Echo Show
(navy sheet, flat cards, inset 4:3 imagery, regular-weight type).

## Look
- Editorial 2D illustration: painterly gradients, soft grain, cut-paper depth. Navy, indigo and teal with warm
  amber light. One master image set the style; every other plate was generated with it as a reference.
- Time of day is information. The same airfield is painted at six times of day (night, pre-dawn, morning, day,
  golden hour, dusk), so a 5:55 AM and a 5:55 PM flight look different before you read a digit. That is the
  AM/PM mistake GateCue exists to catch.
- The lower-left of every plate stays dark and calm; that is where the big time sits (a scrim keeps it >= 4.5:1).

## Motion
- Key plates have a 4-second seamless loop (start frame = end frame): runway lights, fog, steam, headlights.
  Loops fade in over the still only once playing; stills get a slow 18 s push-in.
- The trip panorama has the route drawn over the painting, a moving dot for the drive and the plane sprite
  flying the arc. Everything is transform/opacity or SVG, cheap for Echo Show.
- prefers-reduced-motion: no loops, no push-in, the same content.

### Motion language (cards and simulator)
One idea runs through it: the GateCue mark is a gate and a dot, and the dot is you. Every move is short, explains
something, and lands on the same clean frame a still screenshot would show.
- **Opening:** the arch draws, the dot drops into it, the name sets, then the gate opens (an arch-shaped mask)
  onto the home screen. About 2.5 s, once, tap to skip.
- **Wake:** the home-screen clock flies into the status bar while the home screen dollies back and the sheet rises.
- **Thinking:** the dot runs the arch with a short comet of light; the light bar sweeps a single comet.
- **Replies:** words arrive in reading order. Every time is tagged AM (sunrise gold) or PM (dusk violet); "this
  evening" / "tomorrow morning" get a matching underline. The same colours tag AM/PM over every card picture.
- **Plan card:** a camera move starts close on the front door, travels the road with the dot, then pulls back to
  the whole day while the plane flies the arc; the margin counts up.
- **Flights:** tiles flip up like a departure board; flights that miss the meeting drain to grey.
- **Review:** the time flips in, AM/PM stamps down, the verdict sweeps in as a colour wash; a miss shakes its PM
  tag once and drains the picture.
- **Countdown:** the ring draws in and drains live; cyan with time in hand, then amber warming to red (mixed in
  OKLab so it never passes through a reassuring green); each new minute flips.
- **Confirm:** a ride's route draws stop by stop; a flight pass prints up, its codes flip, the stub tears.

## Rules
- No logos, liveries, readable signage, recognisable landmarks or recognisable people (hackathon rule: no
  third-party trademarks). Planes are plain white; the city is a generic hillside skyline.
- Delivery: design/illo/src holds the 2K masters and loop masters. `python3 scripts/build-assets.py` makes the
  content-hashed WebP and MP4 files in assets/ plus assets/manifest.json. The MCP server serves /assets and
  declares its origin in each card's `_meta.ui.csp.resourceDomains`; the simulator turns that into the card's CSP.
