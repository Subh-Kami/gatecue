import sys, numpy as np
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGB")).astype(np.float32)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
dom = g - np.maximum(r, b)                     # how green-dominant each pixel is
alpha = np.clip(1 - (dom - 30) / 90, 0, 1)      # >120 = fully keyed, <30 = opaque
g2 = np.minimum(g, np.maximum(r, b) + 6)       # de-spill the green fringe
out = np.dstack([r, g2, b, alpha * 255]).astype(np.uint8)
im = Image.fromarray(out, "RGBA")
im = im.crop(im.getbbox())
im.save(dst); print(dst, im.size)
