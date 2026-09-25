# Draws a labeled coordinate grid (app canvas pixels) over dumped page PNGs for ground-truth labeling.
import sys, os
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 0.6
im = Image.open(src).convert('RGB')
d = ImageDraw.Draw(im)
W, H = im.size
for y in range(0, H, 50):
    d.line([(0, y), (W, y)], fill=(255, 0, 0) if y % 100 == 0 else (255, 190, 190), width=1)
    if y % 100 == 0: d.text((2, y + 1), str(y), fill=(255, 0, 0))
for x in range(0, W, 50):
    d.line([(x, 0), (x, H)], fill=(0, 0, 255) if x % 100 == 0 else (190, 190, 255), width=1)
    if x % 100 == 0: d.text((x + 2, 2), str(x), fill=(0, 0, 255))
im = im.resize((int(W * scale), int(H * scale)))
im.save(out, quality=85)
