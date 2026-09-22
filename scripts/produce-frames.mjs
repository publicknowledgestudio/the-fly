// Key frames for every setup. Stage 1: new masters (B, C, D) + Setup A variants.
// Stage 2: variants of the new masters. All in P1 colours; palettes come later
// from one learned colour mapping so every frame recolours identically.
//   node --env-file=.env scripts/produce-frames.mjs 1   |   ... 2
import { readFile, access } from "node:fs/promises";
import { run, upload } from "../lib/fal.mjs";
import { STYLE, NO_TEXT, SINGLE_FRAME, CHARACTER, PALETTES, CONTINUITY, SETUP_B, SETUP_C, SETUP_D, EDIT } from "../spec/the-fly.mjs";

const refs = JSON.parse(await readFile("refs/urls.json", "utf8"));
const scene = "frames";
const exists = (p) => access(p).then(() => true, () => false);
const urlCache = {};
const up = async (p) => (urlCache[p] ??= await upload(p));
const SIZE = { image_size: { width: 2048, height: 1152 }, quality: "high", output_format: "png" };

const master = (spec) => [CONTINUITY, spec, CHARACTER, PALETTES.p1.prompt, STYLE, SINGLE_FRAME, NO_TEXT].join("\n\n");
async function newShot(name, spec) {
  const A = await up("assets/stylesheet/A-master-gptimage2.png");
  const sheet = await up("assets/stylesheet/character-gptimage2.png");
  return run("openai/gpt-image-2/edit", { prompt: master(spec), image_urls: [A, sheet, refs.ref4, refs.ref3], ...SIZE }, { scene, name });
}
async function edit(name, from, change) {
  const src = await up(from);
  const sheet = await up("assets/stylesheet/character-gptimage2.png");
  return run("openai/gpt-image-2/edit", { prompt: EDIT(change) + " The SECOND image is the character model sheet, for reference only.", image_urls: [src, sheet], ...SIZE }, { scene, name });
}

const A = "assets/stylesheet/A-master-gptimage2.png";
const STAGES = {
  1: {
    "B-master": () => newShot("B-master", SETUP_B),
    "C-master": () => newShot("C-master", SETUP_C),
    "D-master": () => newShot("D-master", SETUP_D),
    "A-swat": () => edit("A-swat", A, "The person, annoyed, has lifted their right hand above the laptop lid and swats at the air beside their head — open palm, fingers spread, mid-swing, with a short dry-brush motion smear behind the hand; brows pulled down. The laptop lid still hides the other hand."),
    "A-slump": () => edit("A-slump", A, "The person has gone completely hollow: shoulders collapsed, spine sagging, head hanging forward and tilted a little to one side, face slack, eyes blank and empty (no pupils, just the lids), mouth slightly open. Same position in the frame, same seat, still behind the laptop."),
    "A-look-left": () => edit("A-look-left", A, "The person has sat up and turned their head to their right (towards the left side of the image), searching the room for something, pupils pushed to the corners of the eyes, brows raised, tense and suspicious."),
    "A-look-right": () => edit("A-look-right", A, "The person has sat up and turned their head to their left (towards the right side of the image), searching the room for something, pupils pushed to the corners of the eyes, brows raised, tense and suspicious."),
  },
  2: {
    "B-wary": () => edit("B-wary", "assets/frames/B-master.png", "The person has slowly lifted their head a little and raised their eyes to look straight at the viewer from under lowered brows — wary, suspicious, a silent warning. Mouth a tiny flat line."),
    "B-annoyed": () => edit("B-annoyed", "assets/frames/B-master.png", "The person's head is level and they look straight at the viewer, openly annoyed: brows pulled low and angled inward, lids tense, jaw set, nostrils slightly flared."),
    "B-glare": () => edit("B-glare", "assets/frames/B-master.png", "The person's head is level and they stare straight into the camera with a flat, exhausted, hateful deadpan glare: lids half lowered over the pupils, brows flat and low, mouth a thin line."),
    "B-swat": () => edit("B-swat", "assets/frames/B-master.png", "The person, annoyed, swats at something in front of their face: their open right hand sweeps across the lower right of the frame, very large and close to camera, fingers spread, with a strong dry-brush motion smear; brows pulled down, eyes squinting."),
    "C-wave": () => edit("C-wave", "assets/frames/C-master.png", "The person's right hand has lifted off the keyboard and sweeps across in front of the laptop screen in a quick shooing wave — fingers spread, palm facing left, with a short dry-brush motion smear behind it. The screen stays blank dark plum."),
    "C-press": () => edit("C-press", "assets/frames/C-master.png", "The person's right index finger presses a single key on the keyboard, the other fingers curled, the hand slightly raised and tense. The screen stays blank dark plum."),
    "D-raise": () => edit("D-raise", "assets/frames/D-master.png", "The person has slowly raised their right hand high into the upper-right of the frame, open palm facing the camera, fingers together, very large because it is close to the lens — ready to strike. Their stare into the lens is unchanged."),
    "D-slam": () => edit("D-slam", "assets/frames/D-master.png", "The person's open palm slams toward the camera and fills most of the frame, enormous and extremely close, with a violent smeared dry-brush motion streak; only one eye of the flat stare is still visible past the edge of the hand."),
    "A-soul": () => edit("A-soul", "assets/frames/A-slump.png", "The person's soul is leaving their body: a translucent, pale mint-white ghostly duplicate of the person (same beanie and silhouette, softly glowing, painted in thin pale strokes) floats upward out of the slumped body and hovers above their head, arms dangling, dazed. The slumped body below stays exactly as it is."),
  },
};

const stage = process.argv[2] ?? "1";
const only = process.argv.slice(3);
const jobs = Object.entries(STAGES[stage]).filter(([k]) => !only.length || only.includes(k));
const results = await Promise.allSettled(jobs.map(async ([k, fn]) => {
  if (!only.length && await exists(`assets/frames/${k}.png`)) return console.log(`• ${k} exists, skipping`);
  return fn();
}));
results.forEach((r, i) => r.status === "rejected" && console.log(`✗ ${jobs[i][0]}: ${r.reason?.message} ${JSON.stringify(r.reason?.body ?? "").slice(0, 300)}`));
