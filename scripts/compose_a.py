"""Setup A — build production layers from the approved master + layerize output.

Rules
- Where a layer is VISIBLE in the master, its pixels come from the master, so
  the approved painting (cast shadows included) survives exactly.
- Where a layer is HIDDEN behind nearer layers, pixels come from layerize's
  reconstruction — except in a band next to the visible area, where the
  master's own colours are extended inward (push-pull fill). That band is what
  parallax reveals, so it must continue the master, not the repaint.
- A layer's own silhouette edge comes from layerize so colour and alpha agree.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

W, H = 2048, 1152
LZ = json.load(open("assets/A/layerize/layers.json"))
OUT = Path("assets/A/layers"); OUT.mkdir(parents=True, exist_ok=True)
master = np.asarray(Image.open("assets/stylesheet/A-master-gptimage2.png").convert("RGB"), dtype=np.float32) / 255
sam = lambda k: np.asarray(Image.open(f"assets/A/masks/{k}-0.png").convert("L")) > 127


# ---------- helpers ----------
def placed(i):
    """Layerize layer i placed on its base canvas, resized (premultiplied) to the master canvas."""
    m = LZ[i]
    base_w, base_h = Image.open(LZ[0]["file"]).size
    if m.get("box"):
        l, t, r, b = m["box"]
        canvas = Image.new("RGBA", (base_w, base_h), (0, 0, 0, 0))
        canvas.alpha_composite(Image.open(m["file"]).convert("RGBA").resize((r - l, b - t), Image.LANCZOS), (l, t))
    else:
        canvas = Image.open(m["file"]).convert("RGBA")
    return np.asarray(canvas.convert("RGBa").resize((W, H), Image.LANCZOS).convert("RGBA"), dtype=np.float32) / 255


def over(dst, src):
    a = src[..., 3:4]
    out = dst.copy()
    out[..., :3] = src[..., :3] * a + dst[..., :3] * dst[..., 3:4] * (1 - a)
    out[..., 3:4] = a + dst[..., 3:4] * (1 - a)
    out[..., :3] = np.where(out[..., 3:4] > 1e-4, out[..., :3] / np.maximum(out[..., 3:4], 1e-4), 0)
    return out


def group(indices):
    acc = np.zeros((H, W, 4), np.float32)
    for i in indices:
        acc = over(acc, placed(i))
    return acc


def to_img(a):
    return Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8))


def morph(mask, px, op):
    img = to_img(mask.astype(np.float32)).convert("L")
    f = ImageFilter.MinFilter if op == "erode" else ImageFilter.MaxFilter
    return np.asarray(img.filter(f(px * 2 + 1))) > 127


def box_blur(a, r):
    """Separable box blur on float arrays (H, W[, C]) via cumulative sums; 3 passes ≈ gaussian."""
    for _ in range(3):
        for axis in (0, 1):
            pad = [(0, 0)] * a.ndim; pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
            hi = np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis)
            lo = np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)
            a = (hi - lo) / (2 * r + 1)
    return a


def push_pull(rgb, known):
    """Extend known colours outward into unknown areas, nearest scales first."""
    out, have = rgb * known[..., None], known.astype(np.float32)
    filled = known.copy()
    for r in (2, 4, 8, 16, 32, 64, 128, 256, 512):
        num = box_blur(rgb * known[..., None], r)
        den = box_blur(known.astype(np.float32), r)[..., None]
        ok = (den[..., 0] > 0.02) & ~filled
        out[ok] = (num / np.maximum(den, 1e-6))[ok]
        filled |= ok
        if filled.all():
            break
    out[~filled] = rgb[known].mean(axis=0)
    return out


def build(key, recon, front, exclude=None, is_bg=False):
    alpha = np.ones((H, W), np.float32) if is_bg else recon[..., 3]
    hidden = front > 0.5
    interior = np.ones((H, W), bool) if is_bg else morph(alpha > 0.5, 5, "erode")
    core = interior & ~morph(hidden, 2, "dilate")                      # master pixels, 2px clear of occluders
    if exclude is not None:
        core &= ~morph(exclude, 3, "dilate")
    A = box_blur(core.astype(np.float32), 1)[..., None]
    ext = push_pull(master, core)
    # Tone-match the reconstruction to the master at low frequency (keeps its
    # brush texture, fixes its overall colour), weighting by the layer's alpha.
    a3 = alpha[..., None]
    lp = lambda x: box_blur(x * a3, 24) / np.maximum(box_blur(a3, 24), 1e-4)
    matched = np.clip(recon[..., :3] + (lp(ext) - lp(recon[..., :3])), 0, 1)
    near = (np.clip(box_blur(core.astype(np.float32), 10) * 2.5, 0, 1) * hidden)[..., None]
    rgb = matched * (1 - near) + ext * near
    rgb = rgb * (1 - A) + master * A
    return np.dstack([rgb, alpha])


# ---------- layers ----------
# Layerize indices: 0 base, 1 window, 2 desk, 3 chair, 4 lamp, 5 plant, 6 pen cup, 7 books, 8 mug, 9 person, 10 laptop
bg_r = group([0, 1]); bg_r[..., 3] = 1
chair_r, person_r = group([3]), group([9])
desk_r = group([2, 4, 5, 6, 7, 8, 10])
A_chair, A_person, A_desk = chair_r[..., 3], person_r[..., 3], desk_r[..., 3]

# Forearms painted on top of the desk surface: they belong to the person, in front of the desk.
arm_on_desk = sam("person") & (A_desk > 0.5) & ~sam("laptop")

# SAM masks of everything that is NOT wall: never let their master pixels leak into the plate.
objects = np.logical_or.reduce([sam(k) for k in ("person", "chair", "desk", "laptop", "lamp", "mug", "plant", "books", "pencup")])
layers = {
    "bg": build("bg", bg_r, np.maximum.reduce([A_chair, A_person, A_desk]), exclude=objects, is_bg=True),
    "chair": build("chair", chair_r, np.maximum(A_person, A_desk), exclude=sam("person") | sam("desk")),
    "person": build("person", person_r, A_desk),
    "desk": build("desk", desk_r, np.zeros_like(A_desk), exclude=arm_on_desk),
}
pf_alpha = box_blur(arm_on_desk.astype(np.float32), 1)
layers["personFront"] = np.dstack([master, pf_alpha])

# ---------- pupils: detect in the master, paint out of the person layer ----------
face = sam("face")
ys, xs = np.nonzero(face)
fy0, fy1, fx0, fx1 = ys.min(), ys.max(), xs.min(), xs.max()
lum = master[..., 0] * 0.299 + master[..., 1] * 0.587 + master[..., 2] * 0.114
dark = (lum < 0.33) & face
seen = np.zeros_like(dark)
blobs = []
for y0 in range(fy0, fy1 + 1):
    for x0 in range(fx0, fx1 + 1):
        if not dark[y0, x0] or seen[y0, x0]:
            continue
        q, pts = deque([(y0, x0)]), []
        seen[y0, x0] = True
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if fy0 <= ny <= fy1 and fx0 <= nx <= fx1 and dark[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        p = np.array(pts)
        blobs.append({"n": len(p), "cy": float(p[:, 0].mean()), "cx": float(p[:, 1].mean()),
                      "h": int(np.ptp(p[:, 0]) + 1), "w": int(np.ptp(p[:, 1]) + 1)})
face_h = fy1 - fy0
cands = sorted([b for b in blobs if 12 <= b["n"] <= 900 and 0.5 <= b["w"] / b["h"] <= 1.8
                and fy0 + 0.30 * face_h < b["cy"] < fy0 + 0.75 * face_h], key=lambda b: -b["n"])
pupils = sorted(cands[:2], key=lambda b: b["cx"])
assert len(pupils) == 2, "pupil detection failed"

person = layers["person"]
eyeless = person.copy()
for b in pupils:
    core_r = max(b["w"], b["h"]) / 2
    r_ext = core_r * 1.6                                   # painted dot incl. its soft edge
    rad = int(np.ceil(r_ext + 5))
    off = 2 * rad + 2                                      # clean cheek, fully below the dot
    cy, cx = int(round(b["cy"])), int(round(b["cx"]))
    yy, xx = np.mgrid[-rad:rad + 1, -rad:rad + 1]
    d = np.hypot(yy, xx)
    w = np.clip((rad - d) / (rad - r_ext - 1.5), 0, 1)[..., None]   # full cover to r_ext+1.5, fade to rad
    src = person[cy - rad + off: cy + rad + 1 + off, cx - rad: cx + rad + 1, :3]
    dst = eyeless[cy - rad: cy + rad + 1, cx - rad: cx + rad + 1, :3]
    eyeless[cy - rad: cy + rad + 1, cx - rad: cx + rad + 1, :3] = src * w + dst * (1 - w)
    b["r"] = r_ext
layers["person"] = eyeless

# ---------- export ----------
ORDER = ["bg", "chair", "person", "desk", "personFront"]
DEPTH = {"bg": 0.0, "chair": 0.3, "person": 0.6, "desk": 0.75, "personFront": 0.6}
manifest = {"setup": "A", "canvas": {"w": W, "h": H}, "layers": [], "pupils": [], "anchors": {}}
for key in ORDER:
    img = to_img(layers[key])
    img.save(OUT / f"{key}.png")
    bbox = (0, 0, W, H) if key == "bg" else img.getchannel("A").point(lambda v: 255 if v > 3 else 0).getbbox()
    l, t, r_, b_ = bbox
    img.crop(bbox).save(OUT / f"{key}.webp", "WEBP", quality=90, method=6)
    manifest["layers"].append({"id": key, "file": f"{key}.webp", "x": l, "y": t, "w": r_ - l, "h": b_ - t, "depth": DEPTH[key]})
for b in pupils:
    manifest["pupils"].append({"x": round(b["cx"], 1), "y": round(b["cy"], 1), "r": round(b["r"], 1)})
my, mx = np.nonzero(sam("mug"))
manifest["anchors"]["mugTop"] = {"x": int(mx.mean()), "y": int(my.min()) + 6, "w": int(np.ptp(mx))}
manifest["anchors"]["face"] = {"x": int(fx0), "y": int(fy0), "w": int(fx1 - fx0), "h": int(fy1 - fy0)}
wy, wx = np.nonzero(sam("window"))
manifest["anchors"]["window"] = {"x": int(wx.min()), "y": int(wy.min()), "w": int(np.ptp(wx)), "h": int(np.ptp(wy))}
json.dump(manifest, open(OUT / "manifest.json", "w"), indent=2)

# ---------- verify ----------
stack = np.zeros((H, W, 4), np.float32)
for key in ORDER:
    stack = over(stack, layers[key])
d = np.abs(stack[..., :3] - master).mean(axis=2) * 255
face_box = (slice(fy0, fy1), slice(fx0, fx1))
d_noface = d.copy(); d_noface[face_box] = 0
print(f"recomposite vs master (pupils excluded): mean {d_noface.mean():.2f}/255 | >20: {(d_noface > 20).mean() * 100:.2f}% | >40: {(d_noface > 40).mean() * 100:.2f}%")
for k in manifest["layers"]:
    print(f"  {k['id']:12s} {k['w']}x{k['h']} at ({k['x']},{k['y']}) depth {k['depth']}")
print("pupils", manifest["pupils"])
