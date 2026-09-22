// Dream pass assets.
//   stage 1: E1 (close: him slumped dead over the laptop, the fly's POV), night-window backgrounds, dream sounds
//   stage 2: E2 (the wide dreamscape), from E1
//   stage 3: the pull-back in-between E1 → E2 (Kling), sampled to frames
import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { fal, run, upload } from "../lib/fal.mjs";
import { STYLE, NO_TEXT, SINGLE_FRAME, CHARACTER, PALETTES, EDIT } from "../spec/the-fly.mjs";

const refs = JSON.parse(await readFile("refs/urls.json", "utf8"));
const HQ = { image_size: { width: 2048, height: 1152 }, quality: "high", output_format: "png" };
const exists = (p) => access(p).then(() => true, () => false);
const DREAM = `This is a DREAM: surrealist, in the spirit of Magritte and de Chirico — calm, impossible, weightless, with long hard shadows falling onto nothing. Painted in exactly the same hand as the FIRST image.`;
const stage = process.argv[2] ?? "1";

if (stage === "1") {
  const slump = await upload("film/a/A-slump-p3.webp"), master = await upload("assets/stylesheet/A-master-p3-lut.png"), sheet = await upload("assets/stylesheet/character-gptimage2.png");
  const jobs = [
    run("openai/gpt-image-2/edit", { prompt: [
      `The FIRST image is the approved frame of this short (the person, the desk, the laptop). New shot, the fly's point of view: a close, slightly high, gently tilted view hovering just above the desk. The person lies slumped face-down across the open laptop's keyboard, completely still — dead, or deeply asleep — one arm hanging limp off the desk edge, the green beanie askew, eyes closed. The laptop screen glows a faint dead dark plum. The white mug has tipped over; the coffee has spilled into a flat, perfectly round pool. The desk surface fills the lower half of the frame. Calm, silent, strange.`,
      CHARACTER, PALETTES.p3.prompt, DREAM, STYLE, SINGLE_FRAME, NO_TEXT].join("\n\n"),
      image_urls: [slump, master, sheet, refs.ref1], ...HQ }, { scene: "dream", name: "E1-close" }),
    // Magritte, Empire of Light: night through the window, afternoon in the room
    run("openai/gpt-image-2/edit", { prompt: EDIT("Through the window, the outside is now deep NIGHT: a dark indigo sky with a thin crescent moon and a few small stars above dark tree silhouettes — while the room itself stays in bright afternoon sunlight, with the same light shape on the wall."), image_urls: [await upload("assets/A/layers/bg.png")], ...HQ }, { scene: "dream", name: "A-bg-night" }),
    run("openai/gpt-image-2/edit", { prompt: EDIT("Through the window at the right edge, the outside is now deep NIGHT: a dark indigo sky with a thin crescent moon and a few small stars — while the room itself stays in bright afternoon sunlight."), image_urls: [await upload("assets/B/layers/bg.png")], ...HQ }, { scene: "dream", name: "B-bg-night" }),
  ];
  const SFX = {
    "dream-pad": { text: "Slow dreamy ambient pad, warm soft synth drone with a distant shimmering choir, gently swelling, like a half-remembered dream, no rhythm, no melody", duration_seconds: 16, loop: true },
    "swell": { text: "A soft reversed cymbal swell rising into a hush, dreamy transition whoosh", duration_seconds: 2.5 },
  };
  await mkdir("assets/audio", { recursive: true });
  jobs.push(...Object.entries(SFX).map(async ([name, input]) => {
    const { data } = await fal.subscribe("fal-ai/elevenlabs/sound-effects/v2", { input: { ...input, prompt_influence: 0.5, output_format: "mp3_44100_128" } });
    await writeFile(`assets/audio/${name}.mp3`, Buffer.from(await (await fetch(data.audio.url)).arrayBuffer()));
    console.log("✓", name);
  }));
  const res = await Promise.allSettled(jobs);
  res.forEach((r) => r.status === "rejected" && console.log("✗", r.reason?.message, JSON.stringify(r.reason?.body ?? "").slice(0, 300)));
}

if (stage === "2") {
  const e1 = await upload("assets/dream/E1-close.png"), master = await upload("assets/stylesheet/A-master-p3-lut.png");
  await run("openai/gpt-image-2/edit", { prompt: [
    `The FIRST image is a close shot of this scene. New shot: the SAME desk, laptop and slumped person, now seen from very far above and away — tiny, near the centre of the frame. The room's walls have fallen away: the desk floats in a vast, calm, endless pale mauve and butter-yellow sky of soft painted clouds that stretches to a low horizon. Around the desk, weightless: the wooden chair tilted in mid-air, two notebooks, pencils, the white mug, a sheet of paper — all drifting. A lone white window frame stands upright in the sky nearby, and through it is a night sky with a crescent moon. Long hard cyan-grey shadows fall across the cloud floor. Above the desk, a translucent pale ghost of the person drifts slowly upward. Vast, silent, weightless.`,
    PALETTES.p3.prompt, DREAM, STYLE, SINGLE_FRAME, NO_TEXT].join("\n\n"),
    image_urls: [e1, master, refs.ref1, refs.ref3], ...HQ }, { scene: "dream", name: "E2-wide" });
}

if (stage === "3") {
  const [s, e] = await Promise.all([upload("assets/dream/E1-close.png"), upload("assets/dream/E2-wide.png")]);
  const { data } = await fal.subscribe("fal-ai/kling-video/o1/image-to-video", { input: {
    prompt: "A slow, continuous, weightless pull-back: the camera — a hovering fly — drifts backward and upward away from @Image1, the walls melt away into an endless painted sky, until it arrives exactly at @Image2. Dreamlike, calm, surreal, floating objects drift gently. Hand-painted oil-pastel and gouache animation, flat colours, visible crayon texture, no outlines. No text.",
    start_image_url: s, end_image_url: e, duration: "8" } });
  await mkdir("assets/video", { recursive: true });
  await writeFile("assets/video/E-pullback.mp4", Buffer.from(await (await fetch(data.video.url)).arrayBuffer()));
  console.log("✓ pull-back video");
  const { data: fr } = await fal.subscribe("fal-ai/workflow-utilities/extract-nth-frame", { input: { video_url: data.video.url, frame_interval: 3, max_frames: 90, output_format: "png" } });
  await mkdir("assets/seq/E-pullback", { recursive: true });
  await Promise.all(fr.images.map(async (im, i) => writeFile(`assets/seq/E-pullback/${String(i).padStart(3, "0")}.png`, Buffer.from(await (await fetch(im.url)).arrayBuffer()))));
  console.log(`✓ pull-back: ${fr.images.length} frames`);
}
