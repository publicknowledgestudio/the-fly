// In-between animation: Kling O1 animates from one approved key frame to the
// next; fal's extract-nth-frame samples it down to 8–12 fps so it plays as
// stepped, hand-painted animation (like the rotoscoped references).
//   node --env-file=.env scripts/produce-transitions.mjs [names...]
import { mkdir, writeFile, access } from "node:fs/promises";
import { fal, upload } from "../lib/fal.mjs";

const F = (n) => `assets/frames/${n}.png`;
const A = "assets/stylesheet/A-master-gptimage2.png";
const LOOK = "Hand-painted oil-pastel and gouache animation, flat colours, visible crayon texture, no outlines, exactly the style of the frames. Nothing new appears. No text.";
const T = {
  "A-to-B":    { from: A, to: F("B-master"), secs: "4", every: 3, prompt: "A slow, smooth camera push-in from @Image1 toward the person's face, who keeps calmly working at the laptop, ending exactly on the close-up @Image2." },
  "B-lookup":  { from: F("B-master"), to: F("B-wary"), secs: "3", every: 3, prompt: "Locked-off camera. In @Image1 the person slowly lifts their eyes and then their head to look straight at the viewer, suspicious, ending on @Image2." },
  "B-swat":    { from: F("B-annoyed"), to: F("B-swat"), secs: "3", every: 2, prompt: "Locked-off camera. The annoyed person in @Image1 suddenly swats at a fly in front of their face, the open hand sweeping in fast from the side, ending on @Image2." },
  "A-swat":    { from: A, to: F("A-swat"), secs: "3", every: 2, prompt: "Locked-off camera. The person in @Image1 looks up irritated and swats at the air beside their head with their right hand, ending on @Image2." },
  "C-wave":    { from: F("C-master"), to: F("C-wave"), secs: "3", every: 2, prompt: "Locked-off camera. The hand resting on the keyboard in @Image1 lifts and swipes quickly across in front of the laptop screen to shoo a fly away, ending on @Image2. The screen stays blank dark plum." },
  "D-raise":   { from: F("D-master"), to: F("D-raise"), secs: "4", every: 3, prompt: "Locked-off camera. Keeping the same flat dead-calm stare into the lens, the person in @Image1 slowly raises their right hand high, open palm toward the camera, ending on @Image2." },
  "D-slam":    { from: F("D-raise"), to: F("D-slam"), secs: "3", every: 2, prompt: "The raised hand in @Image1 slams down toward the camera extremely fast, the palm rushing at the lens and filling the frame, ending on @Image2." },
  "A-slump":   { from: A, to: F("A-slump"), secs: "4", every: 3, prompt: "Locked-off camera. The person in @Image1 freezes, then slowly collapses: shoulders drop, spine sags, head hangs, face goes hollow, ending on @Image2." },
  "A-soul":    { from: F("A-slump"), to: F("A-soul"), secs: "4", every: 3, prompt: "Locked-off camera. A translucent pale mint ghost of the slumped person in @Image1 slowly floats up out of their body and hovers above their head, ending on @Image2. The slumped body stays still." },
  "A-look":    { from: F("A-look-left"), to: F("A-look-right"), secs: "4", every: 3, prompt: "Locked-off camera. The person in @Image1 slowly turns their head from the left side of the room to the right, scanning suspiciously for a fly, ending on @Image2." },
};

const exists = (p) => access(p).then(() => true, () => false);
const only = process.argv.slice(2);
const names = Object.keys(T).filter((n) => !only.length || only.includes(n));
await mkdir("assets/video", { recursive: true });

const results = await Promise.allSettled(names.map(async (name) => {
  const t = T[name];
  const video = `assets/video/${name}.mp4`;
  if (!(await exists(t.from)) || !(await exists(t.to))) return console.log(`• ${name}: key frame missing, skipped`);
  let url;
  if (await exists(video) && !only.length) { console.log(`• ${name}: video exists`); url = await upload(video); }
  else {
    const [s, e] = await Promise.all([upload(t.from), upload(t.to)]);
    const { data } = await fal.subscribe("fal-ai/kling-video/o1/image-to-video", {
      input: { prompt: `${t.prompt} ${LOOK}`, start_image_url: s, end_image_url: e, duration: t.secs },
    });
    url = data.video.url;
    await writeFile(video, Buffer.from(await (await fetch(url)).arrayBuffer()));
    console.log(`✓ ${name}: video`);
  }
  const { data: fr } = await fal.subscribe("fal-ai/workflow-utilities/extract-nth-frame", {
    input: { video_url: url, frame_interval: t.every, max_frames: 60, output_format: "png" },
  });
  const dir = `assets/seq/${name}`;
  await mkdir(dir, { recursive: true });
  await Promise.all(fr.images.map(async (im, i) => writeFile(`${dir}/${String(i).padStart(3, "0")}.png`, Buffer.from(await (await fetch(im.url)).arrayBuffer()))));
  console.log(`✓ ${name}: ${fr.images.length} frames (every ${t.every})`);
}));
results.forEach((r, i) => r.status === "rejected" && console.log(`✗ ${names[i]}: ${r.reason?.message} ${JSON.stringify(r.reason?.body ?? "").slice(0, 400)}`));
