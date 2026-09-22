// Style sheet pass: model bake-off on the Setup A master frame + character
// sheet, a props sheet, and Recraft custom-style fly + lettering.
import { readFile, writeFile } from "node:fs/promises";
import { fal, run } from "../lib/fal.mjs";
import { STYLE, NO_TEXT, SINGLE_FRAME, CHARACTER, PALETTES, SETUP_A } from "../spec/the-fly.mjs";

const refs = JSON.parse(await readFile("refs/urls.json", "utf8"));
// ref4 first: it carries the Page 1 palette.
const REF_URLS = [refs.ref4, refs.ref1, refs.ref2, refs.ref3];
const scene = "stylesheet";

const masterPrompt = [SETUP_A, CHARACTER, PALETTES.p1.prompt, STYLE, SINGLE_FRAME, NO_TEXT].join("\n\n");

const sheetPrompt = [
  `A character model sheet for a hand-painted animated short, on flat warm off-white paper. Top row: four full-body standing views of the SAME person, evenly spaced with clear gaps — front, three-quarter, side profile, back. Bottom row: six head-and-shoulders studies of the same person: (1) calm focus, eyes lowered; (2) wary, eyes raised, looking up from under the brows; (3) eyes darted hard to one side, tracking something; (4) dead-calm flat stare straight ahead, lids half lowered; (5) hollow despair, eyes blank and empty, shoulders collapsed; (6) flat hateful glare straight at the viewer. Emotion comes only from brow strokes, pupil position, eyelid shapes and posture — keep the face minimal.`,
  CHARACTER,
  `Colours: exactly the character colours above; cast shadows as flat cool teal-grey shapes (#8FB9B8); darkest accents deep plum (#3A1E3F).`,
  STYLE,
  NO_TEXT,
].join("\n\n");

const propsPrompt = [
  `A props sheet on flat warm off-white paper. Each object isolated with generous space between them, no overlaps, all drawn from the same slightly-above eye-level angle: an open laptop seen from the back (plain off-white lid, no logo); the same laptop seen from the front with a blank dark screen; a white ceramic coffee mug; an articulated desk lamp in teal; a pen cup holding three pencils; a tidy stack of two notebooks (one cobalt, one saffron); a small potted plant in a terracotta pot; a simple wooden desk chair seen from behind.`,
  PALETTES.p1.prompt,
  STYLE,
  NO_TEXT,
].join("\n\n");

const jobs = {
  // --- Bake-off: same prompt + refs, three models ---
  "A-master-nanobananapro": () => run("fal-ai/nano-banana-pro/edit",
    { prompt: masterPrompt, image_urls: REF_URLS, aspect_ratio: "16:9", resolution: "2K", output_format: "png" },
    { scene, name: "A-master-nanobananapro" }),
  "A-master-seedream5": () => run("bytedance/seedream/v5/pro/edit",
    { prompt: masterPrompt, image_urls: REF_URLS, image_size: { width: 2688, height: 1512 }, output_format: "png" },
    { scene, name: "A-master-seedream5" }),
  "A-master-gptimage2": () => run("openai/gpt-image-2/edit",
    { prompt: masterPrompt, image_urls: REF_URLS, image_size: { width: 2048, height: 1152 }, quality: "high", output_format: "png" },
    { scene, name: "A-master-gptimage2" }),

  "character-nanobananapro": () => run("fal-ai/nano-banana-pro/edit",
    { prompt: sheetPrompt, image_urls: REF_URLS, aspect_ratio: "16:9", resolution: "2K", output_format: "png" },
    { scene, name: "character-nanobananapro" }),
  "character-seedream5": () => run("bytedance/seedream/v5/pro/edit",
    { prompt: sheetPrompt, image_urls: REF_URLS, image_size: { width: 2688, height: 1512 }, output_format: "png" },
    { scene, name: "character-seedream5" }),
  "character-gptimage2": () => run("openai/gpt-image-2/edit",
    { prompt: sheetPrompt, image_urls: REF_URLS, image_size: { width: 2048, height: 1152 }, quality: "high", output_format: "png" },
    { scene, name: "character-gptimage2" }),

  "props-nanobananapro": () => run("fal-ai/nano-banana-pro/edit",
    { prompt: propsPrompt, image_urls: REF_URLS, aspect_ratio: "16:9", resolution: "2K", output_format: "png" },
    { scene, name: "props-nanobananapro" }),

  // --- Recraft: custom style from the refs → fly sprite sheet + lettering ---
  "recraft": async () => {
    const { data } = await fal.subscribe("recraft/v4/create-style", {
      input: { image_urls: REF_URLS, base_style: "any", match: "precise" },
    });
    await writeFile("spec/recraft-style.json", JSON.stringify({ style_id: data.style_id, created: new Date().toISOString() }, null, 2));
    console.log(`✓ recraft style_id ${data.style_id}`);
    const base = { style_id: data.style_id, background_color: { r: 245, g: 241, b: 232 } };
    return Promise.allSettled([
      run("recraft/v4/style/text-to-image", { ...base, image_size: "landscape_16_9",
        prompt: "Animation sprite sheet of ONE common housefly, six separate poses evenly spaced in two rows on plain off-white paper: top view wings up; top view wings down blurred mid-beat; side view standing landed; three-quarter view landed rubbing front legs; front view facing the viewer with two big dark red-brown eyes; flying with a smeared wing blur. Body a blunt black-plum gouache blot, wings translucent pale lilac-grey, rough dry-brush edges, no outlines. No text.",
        colors: [{ r: 58, g: 30, b: 63 }, { r: 200, g: 190, b: 215 }, { r: 120, g: 40, b: 30 }] }, { scene, name: "fly-sheet-recraft" }),
      run("recraft/v4/style/text-to-image", { ...base, image_size: "landscape_16_9",
        prompt: "Hand-painted sound-effect lettering reading exactly \"BZZZZZZZZ\" — wobbly, vibrating, uneven brush letters in deep plum gouache with dry-brush edges, letters jittering up and down like a buzzing sound, on plain off-white paper. Nothing else in the image.",
        colors: [{ r: 58, g: 30, b: 63 }] }, { scene, name: "lettering-bzz-recraft" }),
      run("recraft/v4/style/text-to-image", { ...base, image_size: "landscape_16_9",
        prompt: "Hand-painted sound-effect lettering reading exactly \"THWACK!\" — huge, heavy, slammed brush letters in vermilion red gouache with a deep plum drop shape behind, splattered dry-brush edges, on plain off-white paper. Nothing else in the image.",
        colors: [{ r: 240, g: 84, b: 63 }, { r: 58, g: 30, b: 63 }] }, { scene, name: "lettering-thwack-recraft" }),
    ]);
  },
};

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(jobs);
const results = await Promise.allSettled(names.map((n) => jobs[n]()));
results.forEach((r, i) => {
  if (r.status === "rejected") console.log(`✗ ${names[i]}: ${r.reason?.status ?? ""} ${r.reason?.message} ${JSON.stringify(r.reason?.body ?? "").slice(0, 400)}`);
  else if (Array.isArray(r.value)) r.value.forEach((s) => s.status === "rejected" && console.log(`✗ ${names[i]} sub: ${s.reason?.message} ${JSON.stringify(s.reason?.body ?? "").slice(0, 400)}`));
});
