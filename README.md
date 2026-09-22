# The Fly

An interactive, hand-painted short told as one scroll timeline — and a dream.
You are the fly. His hand hunts you across the desk; the THWACK sends you into
kaleidoscopic fly vision, and the camera drifts back into a floating dreamscape.

Every frame is painted in one gouache / oil-pastel style, split into depth layers,
recoloured per page, and stitched with painted in-between animation.

## Run it

```bash
python3 scripts/serve.py film 8732
```

Then open http://localhost:8732, click the title card for sound, and scroll.
(`scripts/serve.py` adds HTTP Range support so the in-between videos can be scrubbed.)

## What's here

| Path | What |
|------|------|
| `film/` | The finished piece. `index.html` is built from `src.html` (markup + CSS) and `src.js` (the scroll-timeline engine); `a/` holds every runtime asset. |
| `film/src.js` | Timeline segments, the hunting hand, the fly, the WebGL compound-eye shader, the dream layer, sound. |
| `spec/the-fly.mjs` | The shared visual spec every generation prompt is built from (style, character, palettes, camera setups). |
| `scripts/` | The production pipeline (below). |
| `assets/frames/`, `assets/stylesheet/`, `assets/dream/`, `assets/hand/`, `assets/fly/` | Approved key frames and source art. |
| `assets/palette/` | The learned page-palette colour lookup tables (P1 → P2, P1 → P3). |
| `stylesheet-page/`, `layer-test/` | The style sheet and the first layer test. |
| `marcus/PLAN.md` | Plan for the next film, on the same base. |

## Pipeline

1. **Key frames** — `produce-frames.mjs`, `produce-hand.mjs`, `produce-dream.mjs` (GPT Image 2 on fal, painted from the approved master + style references).
2. **Layers** — `layerize-setup.mjs` (Seedream layerize + SAM 3.1 masks) → `compose_a.py` / `compose.py`: visible pixels come from the key frame, hidden ones from the reconstruction, tone-matched.
3. **Palettes** — `palette_lut.py` learns a 3D colour LUT from pixel-aligned recolours and applies it to every layer, frame and in-between (greens locked, so the beanie stays green).
4. **In-betweens** — `produce-transitions.mjs` (Kling O1, first → last frame) → frames → `encode-seqs.mjs` (8 fps MP4s the page scrubs frame by frame).
5. **Sound** — `produce-audio.mjs` (ElevenLabs sound effects on fal).
6. **Build** — `build_assets.py`, `build_dream.py`, `bake_screens.py`, then `build_film.py` → `film/index.html`.

Regenerating needs a fal key in `.env` (`FAL_KEY=…`, see `.env.example`) and your own
style references in `refs/` (not included). `npm install` restores the fal client.
