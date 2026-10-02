"""Collect the reel's inputs into design/reel/a from the repo (run from the repo root after `npm run build`
and `node tests/device-shots.mjs`, which writes dist/shots). Then: esbuild reel.ts -> reel.js,
node frames.mjs reel.html 15 60 frames, python3 score.py, and mux (see README line in reel.ts)."""
import os
from PIL import Image
os.makedirs("design/reel/a", exist_ok=True)
S = "dist/shots/"
for n in ["01-plan", "05-options", "07-pm-trap", "04-nudge", "03-ride-booked"]:
    Image.open(S + n + ".png").convert("RGB").crop((95, 98, 1345, 878)).save(f"design/reel/a/{n}.jpg", quality=92)
for n in ["airfield-night", "airfield-predawn", "airfield-morning", "airfield-day", "airfield-golden", "airfield-dusk"]:
    Image.open(f"design/illo/src/{n}.webp").convert("RGB").resize((1920, 1434)).save(f"design/reel/a/{n}.jpg", quality=90)
Image.open("design/illo/src/journey-pano.webp").convert("RGB").resize((3800, 1612)).save("design/reel/a/pano.jpg", quality=90)
Image.open("design/illo/src/sprite-plane.webp").save("design/reel/a/plane.png")
