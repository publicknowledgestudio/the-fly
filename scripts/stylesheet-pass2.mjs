// Style sheet pass 2: palette variants of the chosen master (GPT Image 2),
// props in the chosen style, and a cleaner BZZZZ lettering.
import { readFile } from "node:fs/promises";
import { run, upload } from "../lib/fal.mjs";
import { STYLE, NO_TEXT, PALETTES } from "../spec/the-fly.mjs";

const refs = JSON.parse(await readFile("refs/urls.json", "utf8"));
const { style_id } = JSON.parse(await readFile("spec/recraft-style.json", "utf8"));
const scene = "stylesheet";
const master = await upload("assets/stylesheet/A-master-gptimage2.png");

const recolour = (p) => `Recolour the FIRST image only. Keep every shape, outline position, object, the person, the composition, the camera and the brush-stroke texture exactly the same — pixel-aligned — and change ONLY the colours, mapping each area to this palette: ${PALETTES[p].prompt} Use the second image only as a guide to the colour mood. ${NO_TEXT}`;

const jobs = {
  "A-master-p2": () => run("openai/gpt-image-2/edit",
    { prompt: recolour("p2"), image_urls: [master, refs.ref2], image_size: { width: 2048, height: 1152 }, quality: "high", output_format: "png" },
    { scene, name: "A-master-p2" }),
  "A-master-p3": () => run("openai/gpt-image-2/edit",
    { prompt: recolour("p3"), image_urls: [master, refs.ref1], image_size: { width: 2048, height: 1152 }, quality: "high", output_format: "png" },
    { scene, name: "A-master-p3" }),
  "props": () => run("openai/gpt-image-2/edit",
    { prompt: [`A props sheet on flat warm off-white paper, painted in exactly the same technique as the FIRST image. Each object isolated with generous space between them, no overlaps, all seen from the same slightly-above eye-level angle: an open laptop seen from the back (plain off-white lid, no logo); the same laptop seen from the front with a blank dark screen; a white ceramic coffee mug; a desk lamp; a pen cup holding three pencils; a tidy stack of two notebooks (one cobalt, one saffron); a small potted plant; a simple wooden desk chair seen from behind. Copy each object's design from the first image where it appears there.`, PALETTES.p1.prompt, STYLE, NO_TEXT].join("\n\n"),
      image_urls: [master, refs.ref4, refs.ref3], image_size: { width: 2048, height: 1152 }, quality: "high", output_format: "png" },
    { scene, name: "props-gptimage2" }),
  "bzz": () => run("recraft/v4/style/text-to-image",
    { style_id, image_size: "landscape_16_9",
      prompt: "Hand-painted comic sound-effect lettering reading exactly \"BZZZZZZ\", centred with wide empty margins so every letter is fully visible. Each letter a different size and tilt, bouncing up and down along a wavy line like a buzzing fly's flight path, thick rough deep-plum gouache brush strokes with dry-brush edges, a few tiny motion ticks around the letters. Plain pale off-white paper background, nothing else in the image.",
      colors: [{ r: 58, g: 30, b: 63 }] },
    { scene, name: "lettering-bzz-recraft-v2" }),
};

const results = await Promise.allSettled(Object.values(jobs).map((j) => j()));
results.forEach((r, i) => r.status === "rejected" && console.log(`✗ ${Object.keys(jobs)[i]}: ${r.reason?.message} ${JSON.stringify(r.reason?.body ?? "").slice(0, 400)}`));
