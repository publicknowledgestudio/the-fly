// Setup A, stage 1: text-prompted SAM 3.1 masks of every element in the
// approved master, plus a trial of Seedream's automatic layerize.
import { mkdir, writeFile } from "node:fs/promises";
import { fal, upload } from "../lib/fal.mjs";

const OUT = "assets/A/masks";
await mkdir(OUT, { recursive: true });
await mkdir("assets/A/layerize", { recursive: true });
await writeFile("assets/A/master-url.txt", await upload("assets/stylesheet/A-master-gptimage2.png"));
const master = (await import("node:fs")).readFileSync("assets/A/master-url.txt", "utf8");

const PROMPTS = {
  person: "person", chair: "wooden chair", desk: "red desk", laptop: "laptop",
  lamp: "desk lamp", mug: "coffee mug", plant: "potted plant", books: "stack of books",
  pencup: "pen cup with pencils", window: "window", face: "face", beanie: "green beanie",
};

async function save(url, file) {
  const res = await fetch(url);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

const samJobs = Object.entries(PROMPTS).map(async ([key, prompt]) => {
  const { data } = await fal.subscribe("fal-ai/sam-3-1/image", {
    input: { image_url: master, prompt, apply_mask: false, return_multiple_masks: true, max_masks: 4, include_scores: true, include_boxes: true },
  });
  const masks = data.masks ?? [];
  for (const [i, m] of masks.entries()) await save(m.url, `${OUT}/${key}-${i}.png`);
  console.log(`✓ ${key}: ${masks.length} mask(s), scores ${JSON.stringify(data.scores)}`);
  return { key, scores: data.scores, boxes: data.boxes };
});

const layerizeJob = (async () => {
  const { data } = await fal.subscribe("bytedance/seedream/v5/pro/layerize", {
    input: { image_url: master, image_size: "auto_2K" },
  });
  const meta = [];
  for (const [i, l] of data.layers.entries()) {
    const file = `assets/A/layerize/${String(i).padStart(2, "0")}-${(l.name ?? "base").replace(/[^\w-]+/g, "_").slice(0, 40)}.png`;
    await save(l.image.url, file);
    meta.push({ file, name: l.name, z: l.z_index, box: l.bounding_box?.absolute, description: l.description });
  }
  await writeFile("assets/A/layerize/layers.json", JSON.stringify(meta, null, 2));
  console.log(`✓ layerize: ${meta.length} layers → ${meta.map((m) => m.name ?? "base").join(" | ")}`);
})();

const results = await Promise.allSettled([...samJobs, layerizeJob]);
await writeFile(`${OUT}/sam.json`, JSON.stringify(results.map((r) => r.value ?? String(r.reason)), null, 2));
results.forEach((r) => r.status === "rejected" && console.log("✗", r.reason?.message, JSON.stringify(r.reason?.body ?? "").slice(0, 300)));
