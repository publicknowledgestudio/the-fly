"""Bake the laptop's Page-3 screen states into flat Setup C frames, so the
fly-vision shader (which samples images, not DOM) can show them.
  python3 scripts/bake_screens.py → film/a/C-boot-p3.webp, film/a/C-error-p3.webp
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, "scripts")
from palette_lut import apply as lut_apply  # noqa: E402

W, H = 2048, 1152
man = json.load(open("film/a/manifest.json"))
q = man["setups"]["C"]["anchors"]["screen"]
quad = [q["tl"], q["tr"], q["br"], q["bl"]]
RW, RH = 640, 400

# the C frame in Page-3 colours, rebuilt from its layers
base = Image.new("RGBA", (W, H))
for lid in ("bg", "desk", "person"):
    base.alpha_composite(Image.open(f"assets/C/layers/{lid}.png").convert("RGBA"))
arr = np.asarray(base.convert("RGB"), np.float32) / 255
base = Image.fromarray(np.clip(lut_apply(np.load("assets/palette/p3.npy"), arr) * 255 + 0.5, 0, 255).astype(np.uint8))

mono = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 17)
small = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 13)
heavy = ImageFont.truetype("/System/Library/Fonts/Avenir Next Condensed.ttc", 34, index=8)


def screen(mode):
    im = Image.new("RGB", (RW, RH), (30, 15, 34)); d = ImageDraw.Draw(im)
    if mode == "boot":
        d.text((RW / 2, 160), "RECOVERING SYSTEM…", font=mono, fill=(237, 227, 242), anchor="mm")
        d.rectangle([150, 196, RW - 150, 206], fill=(58, 36, 64))
        d.rectangle([150, 196, 150 + int((RW - 300) * 0.62), 206], fill=(242, 176, 30))
    else:
        for i, line in enumerate(["YOUR WORK COULD NOT", "BE RECOVERED."]):
            d.text((RW / 2, 160 + i * 40), line, font=heavy, fill=(240, 84, 63), anchor="mm")
        d.text((RW / 2, 262), "0 of 2,431 words restored", font=small, fill=(185, 169, 192), anchor="mm")
    return im


def perspective_coeffs(dst_quad, src_rect):
    """PIL PERSPECTIVE coeffs mapping output (frame) coords → input (screen) coords."""
    A, b = [], []
    for (x, y), (u, v) in zip(dst_quad, src_rect):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    return np.linalg.solve(np.array(A, np.float64), np.array(b, np.float64)).tolist()


rect = [(0, 0), (RW, 0), (RW, RH), (0, RH)]
c = perspective_coeffs(quad, rect)
# sanity: the top-left corner of the quad must land on the screen's origin
x, y = quad[0]; den = c[6] * x + c[7] * y + 1
print("corner check (≈0,0):", round((c[0] * x + c[1] * y + c[2]) / den, 2), round((c[3] * x + c[4] * y + c[5]) / den, 2))

for mode in ("boot", "error"):
    scr = screen(mode).transform((W, H), Image.PERSPECTIVE, c, Image.BICUBIC)
    mask = Image.new("L", (RW, RH), 255).transform((W, H), Image.PERSPECTIVE, c, Image.BILINEAR)
    out = base.copy(); out.paste(scr, (0, 0), mask)
    out.save(f"film/a/C-{mode}-p3.webp", "WEBP", quality=86, method=6)
    print("✓", mode)
out.resize((1024, 576)).save("assets/_C-error.png")
