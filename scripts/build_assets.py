"""Assemble every runtime asset for the final film into film/a/ (+ film/a/manifest.json).

  python3 scripts/build_assets.py still      # layers + flat frames + soul + screen masks
  python3 scripts/build_assets.py seq        # palette-mapped in-between frames → assets/seq-out/<name>-<page>/
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, "scripts")
from palette_lut import apply as lut_apply  # noqa: E402

OUT = Path("film/a"); OUT.mkdir(parents=True, exist_ok=True)
LUT = {p: np.load(f"assets/palette/{p}.npy") for p in ("p2", "p3")}
W, H = 2048, 1152


def recolour(img, page):
    if page == "p1":
        return img
    arr = np.asarray(img.convert("RGBA"), np.float32) / 255
    rgb = lut_apply(LUT[page], arr[..., :3])
    return Image.fromarray(np.clip(np.dstack([rgb, arr[..., 3]]) * 255 + 0.5, 0, 255).astype(np.uint8))


def save_webp(img, path, q=86):
    img.save(path, "WEBP", quality=q, method=6)


def still():
    man = {"canvas": {"w": W, "h": H}, "setups": {}, "flats": {}, "extras": {}}
    try:  # keep the in-between frame counts recorded by encode-seqs.mjs
        man["seqs"] = json.load(open(OUT / "manifest.json")).get("seqs", {})
    except FileNotFoundError:
        pass

    # ---- layered setups ----
    LAYERED = {
        "A": ("assets/A/layers", ["p1", "p3"]),
        "B": ("assets/B/layers", ["p1", "p2", "p3"]),
        "C": ("assets/Cn/layers", ["p1", "p2"]),   # laptop shot without the resting hand: the live hand sprite replaces it
    }
    for key, (src, pages) in LAYERED.items():
        m = json.load(open(f"{src}/manifest.json"))
        entry = {"layers": [], "pupils": m.get("pupils", []), "anchors": m.get("anchors", {}), "pages": pages}
        for L in m["layers"]:
            full = Image.open(f"{src}/{L['id']}.png").convert("RGBA")
            box = (L["x"], L["y"], L["x"] + L["w"], L["y"] + L["h"])
            for p in pages:
                save_webp(recolour(full.crop(box), p), OUT / f"{key}-{L['id']}-{p}.webp")
            entry["layers"].append({k: L[k] for k in ("id", "x", "y", "w", "h", "depth")})
        man["setups"][key] = entry
        print(f"✓ layers {key}: {len(m['layers'])} × {pages}")

    # ---- flat key frames ----
    FLATS = {
        "A-swat": ["p1"], "A-slump": ["p3"], "A-look-left": ["p3"], "A-look-right": ["p3"],
        "B-wary": ["p1"], "B-annoyed": ["p1", "p2"], "B-swat": ["p1", "p2"], "B-glare": ["p3"],
        "C-wave": ["p1", "p2"], "C-press": ["p3"],
        "D-master": ["p2"], "D-raise": ["p2"], "D-slam": ["p2"],
    }
    for name, pages in FLATS.items():
        img = Image.open(f"assets/frames/{name}.png").convert("RGB").resize((W, H), Image.LANCZOS)
        for p in pages:
            save_webp(recolour(img, p).convert("RGB"), OUT / f"{name}-{p}.webp", q=84)
        man["flats"][name] = pages
    print(f"✓ flats: {len(FLATS)}")

    # ---- the soul: SAM's ghost mask on the A-soul frame ----
    b = np.asarray(Image.open("assets/frames/A-soul.png").convert("RGB").resize((W, H)), np.float32) / 255
    g = Image.open("assets/A-soul/masks/ghost-0.png").convert("L").resize((W, H))
    g = g.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(4))
    mk = np.asarray(g, np.float32) / 255
    ys = np.nonzero(mk.max(1) > 0.5)[0]; top, bot = ys.min(), ys.max()
    ramp = np.clip((bot - np.arange(H)) / (0.45 * (bot - top)), 0, 1) ** 1.5   # wisp: fade out toward the bottom
    mk = mk * ramp[:, None]
    simg = Image.fromarray((np.dstack([b, mk * 0.9]) * 255).astype(np.uint8))
    box = simg.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    save_webp(recolour(simg.crop(box), "p3"), OUT / "A-soul-layer-p3.webp")
    man["extras"]["soul"] = {"x": box[0], "y": box[1], "w": box[2] - box[0], "h": box[3] - box[1]}
    print("✓ soul layer", man["extras"]["soul"])

    # ---- C: per-frame masks that let the waving hand cover the live screen ----
    scr = man["setups"]["C"]["anchors"]["screen"]
    quad = np.array([scr["tl"], scr["tr"], scr["br"], scr["bl"]], np.float64)
    RW, RH = 640, 400  # the screen element's own (unwarped) size in CSS px
    rect = np.array([[0, 0], [RW, 0], [RW, RH], [0, RH]], np.float64)

    def homography(src, dst):
        A = []
        for (x, y), (u, v) in zip(src, dst):
            A += [[x, y, 1, 0, 0, 0, -u * x, -u * y, -u], [0, 0, 0, x, y, 1, -v * x, -v * y, -v]]
        _, _, Vt = np.linalg.svd(np.array(A)); Hm = Vt[-1].reshape(3, 3)
        return Hm / Hm[2, 2]

    Hrq = homography(rect, quad)  # rect → frame coords
    gy, gx = np.mgrid[0:RH, 0:RW].astype(np.float64)
    pts = np.stack([gx.ravel() + 0.5, gy.ravel() + 0.5, np.ones(gx.size)])
    X, Y = pts[0], pts[1]  # elementwise: this machine's BLAS matmul is unreliable
    den = Hrq[2, 0] * X + Hrq[2, 1] * Y + Hrq[2, 2]
    fx = (Hrq[0, 0] * X + Hrq[0, 1] * Y + Hrq[0, 2]) / den
    fy = (Hrq[1, 0] * X + Hrq[1, 1] * Y + Hrq[1, 2]) / den
    seq_dir = Path("assets/seq/C-wave")
    frames = sorted(seq_dir.glob("*.png"))
    if frames:
        masks = []
        for f in frames:
            im = np.asarray(Image.open(f).convert("RGB").resize((W, H)), np.float32) / 255
            xi = np.clip(fx.round().astype(int), 0, W - 1); yi = np.clip(fy.round().astype(int), 0, H - 1)
            px = im[yi, xi].reshape(RH, RW, 3)
            lum = px[..., 0] * 0.299 + px[..., 1] * 0.587 + px[..., 2] * 0.114
            show = np.clip((0.30 - lum) / 0.12, 0, 1)            # dark screen → show overlay; hand → hide
            m = Image.fromarray((show * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
            masks.append(m)
        strip = Image.new("L", (RW * len(masks), RH))
        for i, m in enumerate(masks):
            strip.paste(m, (i * RW, 0))
        rgba = Image.merge("RGBA", [strip, strip, strip, strip])
        rgba.save(OUT / "C-wave-screenmask.png", optimize=True)
        man["extras"]["screenMask"] = {"frames": len(masks), "w": RW, "h": RH}
        print(f"✓ screen masks: {len(masks)} frames")
    man["extras"]["screenRect"] = {"w": RW, "h": RH}

    # ---- the hunting hand: hand crop + stretchable forearm strip, per pose and palette ----
    man["extras"]["hand"] = {}
    for pose in ("hover", "slap"):
        im = Image.open(f"assets/hand/hand-{pose}-cut.png").convert("RGBA")
        a = np.asarray(im)[..., 3] > 128
        ys = np.nonzero(a.any(1))[0]
        widths = a.sum(1)
        fw = np.median(widths[ys.max() - 200: ys.max()])                     # forearm width near the bottom
        h_ = ys.max() - ys.min()
        lo_, hi_ = int(ys.min() + 0.35 * h_), int(ys.max() - 120)
        sm = np.convolve(widths.astype(float), np.ones(31) / 31, mode="same")   # smoothed width profile
        wrist = lo_ + int(np.argmin(sm[lo_:hi_])) + 10                         # narrowest point between palm and elbow
        top = a[:wrist]; yy, xx = np.nonzero(top)
        palm = (float(xx.mean()), float(yy.mean()))
        cols = np.nonzero(a.any(0))[0]; x0, x1 = int(cols.min()), int(cols.max()) + 1
        bottom = int(ys.max()) + 1
        fx = np.nonzero(a[bottom - 40:bottom].any(0))[0]
        for page in ("p1", "p2"):
            r = recolour(im, page)
            save_webp(r.crop((x0, 0, x1, wrist + 40)), OUT / f"hand-{pose}-top-{page}.webp", q=90)
            save_webp(r.crop((int(fx.min()), wrist, int(fx.max()) + 1, bottom)), OUT / f"hand-{pose}-arm-{page}.webp", q=90)
        man["extras"]["hand"][pose] = {"x0": x0, "w": x1 - x0, "wrist": int(wrist), "palm": [round(palm[0] - x0, 1), round(palm[1], 1)],
                                       "arm": {"x": int(fx.min()) - x0, "w": int(fx.max() - fx.min() + 1), "h": bottom - wrist}}
        print(f"✓ hand {pose}: wrist y={wrist}, palm={man['extras']['hand'][pose]['palm']}, forearm w={int(fw)}")

    json.dump(man, open(OUT / "manifest.json", "w"), indent=1)


def seq():
    PLAN = {
        "A-to-B": ["p1"], "B-lookup": ["p1"], "B-swat": ["p1", "p2"], "A-swat": ["p1"],
        "C-wave": ["p1", "p2"], "D-raise": ["p2"], "D-slam": ["p2"],
        "A-slump": ["p3"], "A-soul": ["p3"], "A-look": ["p3"],
    }
    for name, pages in PLAN.items():
        frames = sorted(Path(f"assets/seq/{name}").glob("*.png"))
        if not frames:
            print(f"• {name}: no frames yet"); continue
        for p in pages:
            od = Path(f"assets/seq-out/{name}-{p}"); od.mkdir(parents=True, exist_ok=True)
            for f in frames:
                img = Image.open(f).convert("RGB")
                recolour(img, p).convert("RGB").save(od / (f.stem + ".jpg"), quality=92)
            print(f"✓ {name}-{p}: {len(frames)} frames")


if __name__ == "__main__":
    {"still": still, "seq": seq}[sys.argv[1]]()
