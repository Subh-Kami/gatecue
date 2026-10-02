#!/usr/bin/env python3
"""Turn the generated illustrations and loops in design/illo/src into small, content-hashed web assets.
Sources: <kind>-<slot>.png or .webp (2K master from the image model) and optional <kind>-<slot>.mp4 (loop from the video model).
Output: assets/img/*.webp (large + small), assets/video/*.mp4, assets/manifest.json. Run: python3 scripts/build-assets.py"""
import hashlib, json, os, subprocess, glob
from PIL import Image

SRC, OUT = "design/illo/src", "assets"
os.makedirs(f"{OUT}/img", exist_ok=True); os.makedirs(f"{OUT}/video", exist_ok=True)
def h(b): return hashlib.sha256(b).hexdigest()[:8]
manifest = {}
for png in sorted(glob.glob(f"{SRC}/*.png") + glob.glob(f"{SRC}/*.webp")):
    name = os.path.splitext(os.path.basename(png))[0]
    kind, slot = name.split("-", 1)
    im = Image.open(png); im = im.convert("RGBA" if kind == "sprite" else "RGB")
    entry = {"w": im.width, "h": im.height}
    sizes = (("img", 480, 90),) if kind == "sprite" else (("img", 1280 if im.width / im.height < 2 else 1920, 80), ("sm", 560 if im.width / im.height < 2 else 960, 76))
    for key, width, q in sizes:
        r = im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
        tmp = f"/tmp/{name}-{key}.webp"; r.save(tmp, "WEBP", quality=q, method=6)
        data = open(tmp, "rb").read(); fn = f"{name}-{key}-{h(data)}.webp"
        open(f"{OUT}/img/{fn}", "wb").write(data); entry[key] = f"img/{fn}"
    mp4 = os.path.splitext(png)[0] + ".mp4"
    if os.path.exists(mp4):
        tmp = f"/tmp/{name}.mp4"
        w = 640 if im.width / im.height < 2 else 1280
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", mp4, "-an", "-vf", f"scale={w}:-2,fps=24,format=yuv420p",
                        "-c:v", "libx264", "-profile:v", "main", "-crf", "27", "-preset", "slow", "-movflags", "+faststart", tmp], check=True)
        data = open(tmp, "rb").read(); fn = f"{name}-{h(data)}.mp4"
        open(f"{OUT}/video/{fn}", "wb").write(data); entry["video"] = f"video/{fn}"
    manifest.setdefault(kind, {})[slot] = entry
    print(f"{name}: " + ", ".join(f"{k}={os.path.getsize(OUT + '/' + v) // 1024} KB" for k, v in entry.items() if isinstance(v, str)))
# drop files no longer referenced
used = {v for k in manifest.values() for e in k.values() for v in e.values() if isinstance(v, str)}
for f in glob.glob(f"{OUT}/img/*") + glob.glob(f"{OUT}/video/*"):
    if os.path.relpath(f, OUT) not in used: os.remove(f)
json.dump(manifest, open(f"{OUT}/manifest.json", "w"), indent=1)
