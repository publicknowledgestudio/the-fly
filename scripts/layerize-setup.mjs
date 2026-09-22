// Layerize a key frame and collect SAM masks for it.
//   node --env-file=.env scripts/layerize-setup.mjs <id> <frame.png> "<layerize prompt>" sam1=prompt sam2=prompt ...
import { mkdir, writeFile } from "node:fs/promises";
import { fal, upload } from "../lib/fal.mjs";

const [id, frame, prompt, ...samArgs] = process.argv.slice(2);
const dir = `assets/${id}`;
await mkdir(`${dir}/layerize`, { recursive: true });
await mkdir(`${dir}/masks`, { recursive: true });
const url = await upload(frame);
const save = async (u, f) => writeFile(f, Buffer.from(await (await fetch(u)).arrayBuffer()));

const layerize = (async () => {
  const { data } = await fal.subscribe("bytedance/seedream/v5/pro/layerize", { input: { image_url: url, image_size: "auto_2K", prompt } });
  const meta = [];
  for (const [i, l] of data.layers.entries()) {
    const file = `${dir}/layerize/${String(i).padStart(2, "0")}-${(l.name ?? "base").replace(/[^\w-]+/g, "_").slice(0, 40)}.png`;
    await save(l.image.url, file);
    meta.push({ file, name: l.name ?? null, z: l.z_index, box: l.bounding_box?.absolute ?? null });
  }
  await writeFile(`${dir}/layerize/layers.json`, JSON.stringify(meta, null, 2));
  console.log(`✓ ${id} layerize: ${meta.map((m) => m.name ?? "BASE").join(" | ")}`);
})();

const sams = samArgs.map(async (arg) => {
  const [key, p] = arg.split("=");
  const { data } = await fal.subscribe("fal-ai/sam-3-1/image", { input: { image_url: url, prompt: p, apply_mask: false, return_multiple_masks: true, max_masks: 3, include_scores: true } });
  // merge all instances of the prompt into one mask file per key
  const files = [];
  for (const [i, m] of (data.masks ?? []).entries()) { const f = `${dir}/masks/${key}-${i}.png`; await save(m.url, f); files.push(f); }
  console.log(`✓ ${id} sam ${key}: ${files.length} mask(s) ${JSON.stringify(data.scores)}`);
});

const res = await Promise.allSettled([layerize, ...sams]);
res.forEach((r) => r.status === "rejected" && console.log("✗", r.reason?.message, JSON.stringify(r.reason?.body ?? "").slice(0, 300)));
