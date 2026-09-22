// Encode each palette-mapped in-between sequence as an 8 fps MP4 (one image =
// one frame) with fal's ffmpeg API, and record frame counts in the manifest.
import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { fal, upload } from "../lib/fal.mjs";

const FPS = 8;
const exists = (p) => access(p).then(() => true, () => false);
const only = process.argv.slice(2);
const dirs = (await readdir("assets/seq-out")).filter((d) => !only.length || only.includes(d)).sort();
const man = JSON.parse(await readFile("film/a/manifest.json", "utf8"));
man.seqs ??= {};

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}

for (const d of dirs) {
  const target = `film/a/seq-${d}.mp4`;
  const files = (await readdir(`assets/seq-out/${d}`)).filter((f) => f.endsWith(".jpg")).sort();
  if (await exists(target) && !only.length) { man.seqs[d] = files.length; console.log(`• ${d} exists`); continue; }
  const retry = async (fn, n = 5) => { for (let a = 1; ; a++) { try { return await fn(); } catch (e) { if (a >= n) throw e; await new Promise((r) => setTimeout(r, 1500 * a)); } } };
  const urls = await pool(files, 4, (f) => retry(() => upload(`assets/seq-out/${d}/${f}`)));
  const { data } = await retry(() => fal.subscribe("fal-ai/ffmpeg-api/images-to-video", { input: { images: urls.map((url) => ({ url, frames: 1 })), fps: FPS } }));
  await retry(async () => writeFile(target, Buffer.from(await (await fetch(data.video.url)).arrayBuffer())));
  man.seqs[d] = files.length;
  console.log(`✓ ${d}: ${files.length} frames → ${target}`);
}
await writeFile("film/a/manifest.json", JSON.stringify(man, null, 1));
