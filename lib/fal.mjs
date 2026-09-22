// Thin wrapper around @fal-ai/client: run a model, download every output
// image into assets/<scene>/, and write a sidecar JSON recording the exact
// model + input so any layer can be regenerated deterministically.
import { fal } from "@fal-ai/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

if (!process.env.FAL_KEY) {
  throw new Error("FAL_KEY is not set. Put it in .env and run with: node --env-file=.env <script>");
}
fal.config({ credentials: process.env.FAL_KEY });

export { fal };

// Upload a local file (e.g. a master frame) so edit/inpaint models can use it.
export async function upload(filePath) {
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(filePath);
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4", mp3: "audio/mpeg" }[ext] ?? "application/octet-stream";
  return fal.storage.upload(new Blob([buf], { type }), { filename: path.basename(filePath) });
}

// run("fal-ai/recraft/v3/text-to-image", {...}, { scene: "s01", name: "L01-background" })
export async function run(model, input, { scene = "misc", name = "out" } = {}) {
  const started = Date.now();
  const result = await fal.subscribe(model, {
    input,
    logs: true,
    onQueueUpdate: (u) => {
      if (u.status === "IN_PROGRESS") u.logs?.forEach((l) => console.log(`  [${name}] ${l.message}`));
    },
  });

  const dir = path.join("assets", scene);
  await mkdir(dir, { recursive: true });

  const images = result.data.images ?? (result.data.image ? [result.data.image] : []);
  const files = [];
  for (const [i, img] of images.entries()) {
    const ext = (img.content_type?.split("/")[1] ?? "png").replace("jpeg", "jpg");
    const file = path.join(dir, `${name}${images.length > 1 ? `-${i + 1}` : ""}.${ext}`);
    const res = await fetch(img.url);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    files.push(file);
  }

  await writeFile(
    path.join(dir, `${name}.json`),
    JSON.stringify({ model, input, requestId: result.requestId, seed: result.data.seed, files, ms: Date.now() - started }, null, 2),
  );
  console.log(`✓ ${name} → ${files.join(", ")}`);
  return { ...result.data, files };
}
