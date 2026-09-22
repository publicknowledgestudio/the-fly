"""Page palettes as learned 3D colour LUTs.

The P1→P2 and P1→P3 recolours of the Setup A master are pixel-aligned, so each
pixel pair is a sample of "what this P1 colour becomes on page N". Fitting a
LUT from those samples and applying it to every layer, frame and in-between
frame recolours the whole film identically — no per-asset regeneration, and
hidden (reconstructed) areas get the same mapping as visible ones.

Greens (the beanie — and with it the plant and trees) are locked to identity.

  python3 scripts/palette_lut.py fit
  python3 scripts/palette_lut.py apply p2 in.png out.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

N = 25  # bins per channel
LUT_DIR = Path("assets/palette"); LUT_DIR.mkdir(parents=True, exist_ok=True)


def load(p, size=(1024, 576)):
    return np.asarray(Image.open(p).convert("RGB").resize(size, Image.BOX), np.float32) / 255


def blur3(v, w):
    """Normalised 3D box blur (radius 1) of values v weighted by w."""
    def b(a):
        for ax in range(3):
            p = [(0, 0)] * a.ndim; p[ax] = (1, 1)
            a = np.pad(a, p, mode="edge")
            a = (np.take(a, range(0, a.shape[ax] - 2), axis=ax) + np.take(a, range(1, a.shape[ax] - 1), axis=ax) + np.take(a, range(2, a.shape[ax]), axis=ax)) / 3
        return a
    return b(v * w[..., None]), b(w)


def rgb_to_hsv(c):
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    m = d > 1e-6
    h = np.where(m & (mx == r), ((g - b) / np.maximum(d, 1e-6)) % 6, h)
    h = np.where(m & (mx == g), (b - r) / np.maximum(d, 1e-6) + 2, h)
    h = np.where(m & (mx == b), (r - g) / np.maximum(d, 1e-6) + 4, h)
    return h * 60, np.where(mx > 0, d / np.maximum(mx, 1e-6), 0), mx


def fit(src_p, dst_p):
    s, d = load(src_p).reshape(-1, 3), load(dst_p).reshape(-1, 3)
    idx = np.clip(np.rint(s * (N - 1)).astype(int), 0, N - 1)
    flat = (idx[:, 0] * N + idx[:, 1]) * N + idx[:, 2]
    sums = np.zeros((N ** 3, 3), np.float64); cnt = np.zeros(N ** 3, np.float64)
    np.add.at(sums, flat, d); np.add.at(cnt, flat, 1)
    lut = (sums / np.maximum(cnt, 1)[:, None]).reshape(N, N, N, 3).astype(np.float32)
    w = (cnt > 0).reshape(N, N, N).astype(np.float32)
    have = w > 0
    # fill empty bins by growing normalised blurs outward from known ones
    val, wt = lut * w[..., None], w.copy()
    for _ in range(40):
        if have.all():
            break
        v2, w2 = blur3(val / np.maximum(wt, 1e-6)[..., None], wt)
        new = (w2 > 1e-4) & ~have
        lut[new] = (v2 / np.maximum(w2, 1e-6)[..., None])[new]
        have |= new
        val, wt = lut * have[..., None], have.astype(np.float32)
    # identity fallback for anything still unreached
    grid = np.stack(np.meshgrid(*[np.linspace(0, 1, N)] * 3, indexing="ij"), -1).astype(np.float32)
    lut[~have] = grid[~have]
    # light smoothing against banding
    sv, sw = blur3(lut, np.ones((N, N, N), np.float32))
    lut = 0.5 * lut + 0.5 * sv / sw[..., None]
    # lock greens to identity (soft ramp on hue/saturation)
    h, sat, v = rgb_to_hsv(grid)
    hue_w = np.clip(1 - np.abs(h - 128) / 55, 0, 1) ** 0.5
    lock = hue_w * np.clip((sat - 0.18) / 0.15, 0, 1) * np.clip((v - 0.12) / 0.1, 0, 1)
    lut = lut * (1 - lock[..., None]) + grid * lock[..., None]
    return lut, cnt


def apply(lut, rgb):
    """Trilinear lookup; rgb float (..., 3) in 0..1."""
    x = np.clip(rgb, 0, 1) * (N - 1)
    i0 = np.floor(x).astype(int); i0 = np.clip(i0, 0, N - 2); f = x - i0
    out = np.zeros_like(rgb)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                wgt = (f[..., 0] if dx else 1 - f[..., 0]) * (f[..., 1] if dy else 1 - f[..., 1]) * (f[..., 2] if dz else 1 - f[..., 2])
                out += lut[i0[..., 0] + dx, i0[..., 1] + dy, i0[..., 2] + dz] * wgt[..., None]
    return out


def apply_file(page, src, dst):
    lut = np.load(LUT_DIR / f"{page}.npy")
    im = Image.open(src)
    has_a = im.mode in ("RGBA", "LA") or "transparency" in im.info
    arr = np.asarray(im.convert("RGBA" if has_a else "RGB"), np.float32) / 255
    rgb = apply(lut, arr[..., :3])
    out = np.dstack([rgb, arr[..., 3]]) if has_a else rgb
    img = Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8))
    if str(dst).endswith(".webp"):
        img.save(dst, "WEBP", quality=90, method=6)
    else:
        img.save(dst)


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "fit":
        src = "assets/stylesheet/A-master-gptimage2.png"
        for page in ("p2", "p3"):
            lut, cnt = fit(src, f"assets/stylesheet/A-master-{page}.png")
            np.save(LUT_DIR / f"{page}.npy", lut)
            check = apply(lut, load(src))
            target = load(f"assets/stylesheet/A-master-{page}.png")
            hh, ss, _ = rgb_to_hsv(load(src))
            not_green = ~((np.abs(hh - 128) < 45) & (ss > 0.2))
            err = np.abs(check - target).mean(-1)[not_green] * 255
            print(f"{page}: {int((cnt > 0).sum())}/{N**3} bins sampled | fit error (non-green) mean {err.mean():.1f}/255, p90 {np.percentile(err, 90):.1f}")
            Image.fromarray((np.clip(check, 0, 1) * 255).astype(np.uint8)).save(LUT_DIR / f"_check-A-{page}.png")
    elif cmd == "apply":
        apply_file(sys.argv[2], sys.argv[3], sys.argv[4])
