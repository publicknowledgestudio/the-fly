// THE FLY — shared visual spec. Every generation prompt is assembled from
// these blocks so no asset can drift from the agreed look.

export const STYLE = `Medium: hand-painted gouache and poster paint on paper with oil-pastel scumbling, painted over photographic reference like a single rotoscoped animation frame. Flat opaque colour shapes with NO outlines; every edge is a rough dry-brush edge. Visible directional brush strokes and paper tooth inside every shape, slight chalky grain. Colour is assigned, not naturalistic: skin is lilac-violet, each garment and object is one flat saturated colour with at most one darker tone. Light is shown ONLY by hard-edged flat cast-shadow shapes in one cool colour — no gradients, no soft shading, no specular highlights, nothing that looks 3D-rendered or photographic. Faces are almost featureless: two small dark plum dot pupils, short brush-stroke brows, a tiny nose shadow, no detailed mouth. Loose, naive, confident painting. Use the attached reference images ONLY for painting technique, texture, edge quality and colour attitude — do not copy their subjects, skateboards, skateparks, running tracks, poses or compositions.`;

export const NO_TEXT = `No text, no letters, no labels, no signature, no border.`;
export const SINGLE_FRAME = `A single full-bleed image — not a grid, not a comic panel, not a collage.`;

export const CHARACTER = `The person: an androgynous young adult, about 25, slim build, realistic human proportions (about 7.5 heads tall). Lilac-violet skin (#A58BC9) with one slightly darker violet shadow tone. Short dark hair mostly hidden under a forest-green knit beanie (#2E8B4E). Oversized saffron-yellow crew-neck t-shirt (#F2B01E). Loose cobalt-blue jeans (#3B6BB5). Green-and-white sneakers. No glasses, no jewellery, no accessories.`;

// Colours sampled from the references: P1 ← ref 4, P2 ← ref 2, P3 ← ref 1.
export const PALETTES = {
  p1: {
    name: "Page 1 — Calm",
    source: "ref 4",
    prompt: `Palette: pale mint-aqua wall (#C8E9EA) scumbled with whiter mint strokes (#EEF7F9); vermilion-red desk top (#F0543F) with a deeper red front edge (#B04639); saffron t-shirt, cobalt jeans, green beanie, lilac skin; off-white laptop (#E6ECEB); cast shadows as flat cool teal-grey shapes (#8FB9B8); darkest accents deep plum (#3A1E3F).`,
    swatches: { wall: "#C8E9EA", wallLight: "#EEF7F9", desk: "#F0543F", deskEdge: "#B04639", shirt: "#F2B01E", jeans: "#3B6BB5", beanie: "#2E8B4E", skin: "#A58BC9", laptop: "#E6ECEB", shadow: "#8FB9B8", dark: "#3A1E3F" },
  },
  p2: {
    name: "Page 2 — War",
    source: "ref 2",
    prompt: `Palette: hot-pink wall (#F865C1) scumbled with lighter pinks (#F97DC3, #FDC9E5); magenta desk top (#EB50C0); deep plum (#320D41) for all shadows and darks, with halftone-dot texture in the darkest areas; saffron t-shirt stays; teal accents (#129A9A); lilac skin pushed toward plum (#73256F in shadow).`,
    swatches: { wall: "#F865C1", wallLight: "#FDC9E5", desk: "#EB50C0", deskEdge: "#73256F", shirt: "#F2B01E", jeans: "#3B6BB5", accent: "#129A9A", skin: "#9C6FB8", shadow: "#73256F", dark: "#320D41" },
  },
  p3: {
    name: "Page 3 — Consequences",
    source: "ref 1",
    prompt: `Palette: drained mauve wall (#DEC4BC, #C8B8B6); pale butter-yellow desk top (#F2DD7E, #F7F0A4); cast shadows in a flat cool cyan-grey (#8FB3C0); violet-grey mid-tones (#7B6F96); darkest accents blackish violet (#2B1A3F); the t-shirt faded to pale ochre (#E8C766), jeans to dusty blue (#6E86B0).`,
    swatches: { wall: "#DEC4BC", wallLight: "#C8B8B6", desk: "#F2DD7E", deskEdge: "#F7F0A4", shirt: "#E8C766", jeans: "#6E86B0", skin: "#9E8FB8", shadow: "#8FB3C0", mid: "#7B6F96", dark: "#2B1A3F" },
  },
};

// SETUP A — "The Desk": front view from the wall the person faces.
export const SETUP_A = `Scene: a calm, perfectly organised home desk on a sunny afternoon. Camera: straight-on front view from the far side of the desk, lens at the seated person's chest height, 35mm-equivalent slightly wide lens, horizon about 45% down from the top of frame, 16:9 landscape. Composition: the person sits at the desk slightly left of centre, facing the camera, head tilted down, calmly focused on an open laptop. We see the BACK of the laptop lid in the lower-centre foreground; the lid hides their hands and forearms. The desk top is a flat slab spanning the full frame width, its front edge near the bottom of frame. On the desk, neatly arranged: a white ceramic coffee mug in the right foreground, a desk lamp at far left, a pen cup, a tidy stack of two notebooks, a small potted plant on the right. Behind the person: the back of a simple wooden chair, and a plain back wall with a window at upper right through which hard afternoon sunlight falls. Light: hard sunlight from the window at upper right behind the person; cast shadows fall toward the lower left as flat cool shapes, and a pale parallelogram of window light lies on the wall. Leave generous empty wall space around the person's head. Mood: serene, ordered, quiet.`;

// ---------------------------------------------------------------------------
// Continuity: every new setup is painted FROM the approved Setup A master.
export const CONTINUITY = `The FIRST image is the approved master frame of this animated short. Paint the new shot as the same world: copy exactly its oil-pastel / gouache technique and texture, its flat colours, the person's design (lilac skin, green knit beanie, dark hair, saffron-yellow t-shirt), the room (mint wall, the pale window-light shape, the white-framed window with green trees at the right), and the props (off-white laptop, vermilion desk, white mug). The SECOND image is the character model sheet — keep the person on-model. The remaining images are style references only.`;

// SETUP B — "Close-up": eyes, expressions, the fly circling the head.
export const SETUP_B = `New camera setup, same scene: CLOSE-UP. Straight-on front view at the seated person's eye level, 50mm-equivalent lens, 16:9 landscape, framed from mid-chest up. The person's head and shoulders sit in the centre and fill about 55% of the frame height; head tilted slightly down, eyes lowered to the laptop, calm focus. The top edge of the open laptop lid (its plain off-white back) runs straight across the bottom 14% of the frame as a flat horizontal band, covering the lower chest. Behind: the same mint wall, with part of the pale window-light shape to the left of the head and the white window frame at the far right edge. Generous empty wall around the head on all sides. Same hard afternoon light from the upper right; cast shadows as flat cool teal-grey shapes.`;

// SETUP C — "Over the shoulder": the screen (live HTML), the waving hand, the wall.
export const SETUP_C = `New camera setup, same scene: OVER-THE-SHOULDER. Camera just behind and to the left of the seated person at their head height, looking past them at the open laptop on the vermilion desk and the mint wall behind it, 35mm-equivalent lens, 16:9 landscape. Foreground left: the back of the person's head (green beanie, dark hair at the nape) and their saffron-yellow shoulder, large and cropped by the left and bottom frame edges, filling the left third. Middle: the open off-white laptop seen from the front, slightly angled; the screen is a flat, evenly painted very dark plum rectangle (#2A1630) inside a thin off-white bezel — completely blank, no reflections, no text, no icons. The keyboard is visible; the person's right hand (lilac) rests on the keyboard at lower centre. To the right of the laptop: the white coffee mug. Background: the plain mint wall fills the upper 40% of the frame and is empty, with the edge of the pale window-light shape. Same hard light from the upper right; flat cool teal-grey cast shadows.`;

// SETUP D — "Webcam point of view": the standoff.
export const SETUP_D = `New camera setup, same scene: WEBCAM POINT OF VIEW. The camera is the laptop screen itself — low, very close, looking slightly up at the seated person, 28mm-equivalent wide lens with mild distortion, 16:9 landscape. The person leans in toward the camera and stares straight into the lens with a dead-calm flat stare: lids half lowered, both pupils centred on the viewer, brows level, mouth a flat line. Face and shoulders fill the centre of the frame; the face is about 35% of the frame height. Hands are down, out of frame. Behind them: the same back wall as the FIRST image — mint wall, the pale window-light shape, the white-framed window with green trees at the right edge — and the top of the wooden chair behind their shoulders. Leave the upper-right quarter of the frame as empty wall. Same hard light from the upper right; flat cool teal-grey cast shadows.`;

// Edits of an existing frame: only the named change, everything else pixel-identical.
export const EDIT = (change) => `Edit the FIRST image. ${change} Keep everything else exactly the same and pixel-aligned: the camera, the framing, the background, the lighting, the colours and the oil-pastel brush texture. Same person, on-model. No text.`;
