"""Generic layer builder (same rules as compose_a.py, driven by a config).

  python3 scripts/compose.py B        # uses CONFIG["B"]

- visible pixels come from the key frame; hidden pixels from layerize,
  tone-matched, with the key frame's colours extended into the band that
  parallax can reveal;
- layerize layers are grouped into production layers by name keywords;
- optional pupil removal (pupils are drawn in code).
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

CONFIG = {
    "B": {
        "frame": "assets/frames/B-master.png",
        "groups": [  # back → front
            {"id": "bg", "depth": 0.0, "match": ["base", "wall", "window", "background", "light", "shadow"], "is_bg": True},
            {"id": "person", "depth": 0.55, "match": ["person", "character", "man", "woman", "figure", "head", "face", "beanie", "hat", "shirt", "worker", "portrait", "boy", "girl"], "pupils": True},
            {"id": "lid", "depth": 0.9, "match": ["laptop", "lid", "computer"]},
        ],
        "default": "bg",
        "bg_exclude": ["person", "laptop"],
    },
    "C": {
        "frame": "assets/frames/C-master.png",
        "groups": [
            {"id": "bg", "depth": 0.0, "match": ["base", "wall", "window", "background", "light", "shadow"], "is_bg": True},
            {"id": "desk", "depth": 0.45, "match": ["desk", "table", "laptop", "computer", "keyboard", "screen", "mug", "cup", "coffee"]},
            {"id": "person", "depth": 0.9, "match": ["person", "character", "man", "woman", "figure", "head", "beanie", "hat", "shoulder", "hand", "arm", "worker", "hair", "boy", "girl"]},
        ],
        "default": "desk",
        "bg_exclude": ["person", "laptop", "desk", "mug"],
    },
    "Cn": {
        "frame": "assets/frames/C-nohand.png",
        "groups": [
            {"id": "bg", "depth": 0.0, "match": ["base", "wall", "window", "background", "light", "shadow"], "is_bg": True},
            {"id": "desk", "depth": 0.45, "match": ["desk", "table", "laptop", "computer", "keyboard", "screen", "mug", "cup", "coffee"]},
            {"id": "person", "depth": 0.9, "match": ["person", "character", "man", "woman", "figure", "head", "beanie", "hat", "shoulder", "worker", "hair", "boy", "girl"]},
        ],
        "default": "desk",
        "bg_exclude": ["person", "laptop", "desk", "mug"],
    },
}


def run(key):
    cfg = CONFIG[key]
    out_dir = Path(f"assets/{key}/layers"); out_dir.mkdir(parents=True, exist_ok=True)
    LZ = json.load(open(f"assets/{key}/layerize/layers.json"))
    master = np.asarray(Image.open(cfg["frame"]).convert("RGB"), np.float32) / 255
    H, W = master.shape[:2]
    base_w, base_h = Image.open(LZ[0]["file"]).size

    def sam(k):
        fs = sorted(Path(f"assets/{key}/masks").glob(f"{k}-*.png"))
        m = np.zeros((H, W), bool)
        for f in fs:
            m |= np.asarray(Image.open(f).convert("L").resize((W, H))) > 127
        return m

    def placed(m):
        if m.get("box"):
            l, t, r, b = m["box"]
            c = Image.new("RGBA", (base_w, base_h), (0, 0, 0, 0))
            c.alpha_composite(Image.open(m["file"]).convert("RGBA").resize((r - l, b - t), Image.LANCZOS), (l, t))
        else:
            c = Image.open(m["file"]).convert("RGBA")
        return np.asarray(c.convert("RGBa").resize((W, H), Image.LANCZOS).convert("RGBA"), np.float32) / 255

    def over(dst, src):
        a = src[..., 3:4]; out = dst.copy()
        out[..., :3] = src[..., :3] * a + dst[..., :3] * dst[..., 3:4] * (1 - a)
        out[..., 3:4] = a + dst[..., 3:4] * (1 - a)
        out[..., :3] = np.where(out[..., 3:4] > 1e-4, out[..., :3] / np.maximum(out[..., 3:4], 1e-4), 0)
        return out

    to_img = lambda a: Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8))

    def morph(mask, px, op):
        img = to_img(mask.astype(np.float32)).convert("L")
        return np.asarray(img.filter((ImageFilter.MinFilter if op == "erode" else ImageFilter.MaxFilter)(px * 2 + 1))) > 127

    def box_blur(a, r):
        for _ in range(3):
            for axis in (0, 1):
                pad = [(0, 0)] * a.ndim; pad[axis] = (r + 1, r)
                c = np.cumsum(np.pad(a, pad, mode="edge"), axis=axis)
                a = (np.take(c, np.arange(2 * r + 1, c.shape[axis]), axis=axis) - np.take(c, np.arange(0, c.shape[axis] - 2 * r - 1), axis=axis)) / (2 * r + 1)
        return a

    def push_pull(rgb, known):
        out = rgb * known[..., None]; filled = known.copy()
        for r in (2, 4, 8, 16, 32, 64, 128, 256, 512):
            num = box_blur(rgb * known[..., None], r); den = box_blur(known.astype(np.float32), r)[..., None]
            ok = (den[..., 0] > 0.02) & ~filled
            out[ok] = (num / np.maximum(den, 1e-6))[ok]; filled |= ok
            if filled.all():
                break
        out[~filled] = rgb[known].mean(axis=0) if known.any() else 0.5
        return out

    def build(recon, front, exclude=None, is_bg=False):
        alpha = np.ones((H, W), np.float32) if is_bg else recon[..., 3]
        hidden = front > 0.5
        interior = np.ones((H, W), bool) if is_bg else morph(alpha > 0.5, 5, "erode")
        core = interior & ~morph(hidden, 2, "dilate")
        if exclude is not None:
            core &= ~morph(exclude, 3, "dilate")
        A = box_blur(core.astype(np.float32), 1)[..., None]
        ext = push_pull(master, core)
        a3 = alpha[..., None]
        lp = lambda x: box_blur(x * a3, 24) / np.maximum(box_blur(a3, 24), 1e-4)
        matched = np.clip(recon[..., :3] + (lp(ext) - lp(recon[..., :3])), 0, 1)
        near = (np.clip(box_blur(core.astype(np.float32), 10) * 2.5, 0, 1) * hidden)[..., None]
        rgb = matched * (1 - near) + ext * near
        rgb = rgb * (1 - A) + master * A
        return np.dstack([rgb, alpha])

    # --- group layerize layers by name ---
    groups = {g["id"]: [] for g in cfg["groups"]}
    for i, m in enumerate(LZ):
        name = (m.get("name") or "base").lower()
        gid = next((g["id"] for g in cfg["groups"] if any(k in name for k in g["match"])), cfg["default"])
        groups[gid].append(i)
        print(f"  layerize[{i}] {m.get('name') or 'BASE':40s} → {gid}")
    recon = {}
    for g in cfg["groups"]:
        acc = np.zeros((H, W, 4), np.float32)
        for i in sorted(groups[g["id"]], key=lambda i: LZ[i]["z"]):
            acc = over(acc, placed(LZ[i]))
        if g.get("is_bg"):
            acc[..., 3] = 1
        recon[g["id"]] = acc

    ids = [g["id"] for g in cfg["groups"]]
    layers = {}
    for n, g in enumerate(cfg["groups"]):
        front = np.zeros((H, W), np.float32)
        for later in ids[n + 1:]:
            front = np.maximum(front, recon[later][..., 3])
        excl = None
        if g.get("is_bg"):
            excl = np.logical_or.reduce([sam(k) for k in cfg["bg_exclude"]])
        layers[g["id"]] = build(recon[g["id"]], front, excl, g.get("is_bg", False))

    manifest = {"setup": key, "canvas": {"w": W, "h": H}, "layers": [], "pupils": [], "anchors": {}}

    # --- pupils ---
    for g in cfg["groups"]:
        if not g.get("pupils"):
            continue
        face = sam("face")
        ys, xs = np.nonzero(face)
        fy0, fy1, fx0, fx1 = ys.min(), ys.max(), xs.min(), xs.max()
        area = face.sum()
        lum = master[..., 0] * 0.299 + master[..., 1] * 0.587 + master[..., 2] * 0.114
        dark = (lum < 0.33) & face
        seen = np.zeros_like(dark); blobs = []
        for y0 in range(fy0, fy1 + 1):
            for x0 in range(fx0, fx1 + 1):
                if not dark[y0, x0] or seen[y0, x0]:
                    continue
                q, pts = deque([(y0, x0)]), []; seen[y0, x0] = True
                while q:
                    y, x = q.popleft(); pts.append((y, x))
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = y + dy, x + dx
                        if fy0 <= ny <= fy1 and fx0 <= nx <= fx1 and dark[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True; q.append((ny, nx))
                p = np.array(pts)
                blobs.append({"n": len(p), "cy": float(p[:, 0].mean()), "cx": float(p[:, 1].mean()), "h": int(np.ptp(p[:, 0]) + 1), "w": int(np.ptp(p[:, 1]) + 1)})
        fh = fy1 - fy0
        cands = sorted([b for b in blobs if area * 0.0004 <= b["n"] <= area * 0.03 and 0.5 <= b["w"] / b["h"] <= 1.8
                        and fy0 + 0.25 * fh < b["cy"] < fy0 + 0.75 * fh], key=lambda b: -b["n"])
        pupils = sorted(cands[:2], key=lambda b: b["cx"])
        print("  pupils:", [(round(b["cx"]), round(b["cy"]), b["n"]) for b in pupils])
        if len(pupils) == 2:
            L = layers[g["id"]]; E = L.copy()
            for b in pupils:
                r_ext = max(b["w"], b["h"]) / 2 * 1.6; rad = int(np.ceil(r_ext + 5)); off = 2 * rad + 2
                cy, cx = int(round(b["cy"])), int(round(b["cx"]))
                yy, xx = np.mgrid[-rad:rad + 1, -rad:rad + 1]
                w = np.clip((rad - np.hypot(yy, xx)) / (rad - r_ext - 1.5), 0, 1)[..., None]
                src = L[cy - rad + off: cy + rad + 1 + off, cx - rad: cx + rad + 1, :3]
                E[cy - rad: cy + rad + 1, cx - rad: cx + rad + 1, :3] = src * w + E[cy - rad: cy + rad + 1, cx - rad: cx + rad + 1, :3] * (1 - w)
                manifest["pupils"].append({"x": round(b["cx"], 1), "y": round(b["cy"], 1), "r": round(r_ext, 1), "layer": g["id"]})
            layers[g["id"]] = E
            manifest["anchors"]["face"] = {"x": int(fx0), "y": int(fy0), "w": int(fx1 - fx0), "h": int(fy1 - fy0)}

    for g in cfg["groups"]:
        img = to_img(layers[g["id"]])
        img.save(out_dir / f"{g['id']}.png")
        bbox = (0, 0, W, H) if g.get("is_bg") else img.getchannel("A").point(lambda v: 255 if v > 3 else 0).getbbox()
        img.crop(bbox).save(out_dir / f"{g['id']}.webp", "WEBP", quality=90, method=6)
        manifest["layers"].append({"id": g["id"], "file": f"{g['id']}.webp", "x": bbox[0], "y": bbox[1], "w": bbox[2] - bbox[0], "h": bbox[3] - bbox[1], "depth": g["depth"]})

    # screen quad for live HTML (Setup C)
    scr = sam("screen")
    if scr.any():
        ys, xs = np.nonzero(scr)
        pts = np.stack([xs, ys], 1).astype(np.float32)
        corners = {"tl": pts[np.argmin(pts[:, 0] + pts[:, 1])], "tr": pts[np.argmax(pts[:, 0] - pts[:, 1])],
                   "br": pts[np.argmax(pts[:, 0] + pts[:, 1])], "bl": pts[np.argmin(pts[:, 0] - pts[:, 1])]}
        manifest["anchors"]["screen"] = {k: [round(float(v[0]), 1), round(float(v[1]), 1)] for k, v in corners.items()}
    for k in ("mug", "wall"):
        m = sam(k)
        if m.any():
            ys, xs = np.nonzero(m)
            manifest["anchors"][k] = {"x": int(xs.min()), "y": int(ys.min()), "w": int(np.ptp(xs)), "h": int(np.ptp(ys))}
    json.dump(manifest, open(out_dir / "manifest.json", "w"), indent=2)

    stack = np.zeros((H, W, 4), np.float32)
    for g in cfg["groups"]:
        stack = over(stack, layers[g["id"]])
    d = np.abs(stack[..., :3] - master).mean(axis=2) * 255
    print(f"  recomposite vs frame: mean {d.mean():.2f}/255 | >40: {(d > 40).mean() * 100:.2f}%")
    print("  manifest:", json.dumps({k: v for k, v in manifest.items() if k != "layers"}))


if __name__ == "__main__":
    run(sys.argv[1])
