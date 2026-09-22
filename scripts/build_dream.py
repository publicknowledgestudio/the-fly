"""Dream-pass runtime assets → film/a/
  python3 scripts/build_dream.py still   # night windows, E1 flat, floating props, sounds
  python3 scripts/build_dream.py seq     # the pull-back frames → assets/seq-out/E-pullback-p3
"""
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, "scripts")
from build_assets import recolour, save_webp  # noqa: E402

OUT = Path("film/a")
W, H = 2048, 1152


def still():
    # Magritte's Empire of Light: night outside, afternoon inside (A and B backgrounds are full-frame layers)
    for key, pages in (("A", ["p1"]), ("B", ["p1", "p2"])):
        night = Image.open(f"assets/dream/{key}-bg-night.png").convert("RGB").resize((W, H), Image.LANCZOS)
        for p in pages:
            save_webp(recolour(night, p).convert("RGB"), OUT / f"{key}-bg-{p}.webp")
        print(f"✓ {key} background: night window ({pages})")
    save_webp(Image.open("assets/dream/E1-close.png").convert("RGB").resize((W, H), Image.LANCZOS), OUT / "E1-close.webp", q=86)
    print("✓ E1-close")
    # props that drift weightlessly past the camera in the pull-back
    for name, src in (("mug", "08-White_mug"), ("books", "07-Stacked_books"), ("pencils", "06-Green_pen_holder_with_pens")):
        im = Image.open(f"assets/A/layerize/{src}.png").convert("RGBA")
        im = im.crop(im.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox())
        im.thumbnail((700, 700), Image.LANCZOS)
        save_webp(recolour(im, "p3"), OUT / f"prop-{name}.webp", q=88)
        print(f"✓ prop {name} {im.size}")
    for n in ("dream-pad", "swell"):
        shutil.copy(f"assets/audio/{n}.mp3", OUT / f"{n}.mp3")
    print("✓ sounds")


def seq():
    frames = sorted(Path("assets/seq/E-pullback").glob("*.png"))
    od = Path("assets/seq-out/E-pullback-p3"); od.mkdir(parents=True, exist_ok=True)
    for f in frames:
        Image.open(f).convert("RGB").save(od / (f.stem + ".jpg"), quality=92)
    print(f"✓ E-pullback: {len(frames)} frames")


if __name__ == "__main__":
    {"still": still, "seq": seq}[sys.argv[1]]()
