// Laptop shot without the resting right hand, plus a free hand+forearm sprite
// (hover and slap) that the page can move to follow the fly.
//   node --env-file=.env scripts/produce-hand.mjs 1   → C-nohand frame + hand-hover sprite
//   node --env-file=.env scripts/produce-hand.mjs 2   → hand-slap (edit of hover)
import { writeFile } from "node:fs/promises";
import { fal, run, upload } from "../lib/fal.mjs";
import { EDIT, STYLE, NO_TEXT } from "../spec/the-fly.mjs";

const C = "assets/frames/C-master.png";
const sheet = "assets/stylesheet/character-gptimage2.png";
const HQ = { quality: "high", output_format: "png" };
const cut = async (src, out) => {
  const { data } = await fal.subscribe("fal-ai/birefnet/v2", { input: { image_url: await upload(src), model: "General Use (Heavy)", operating_resolution: "2048x2048", output_format: "png" } });
  await writeFile(out, Buffer.from(await (await fetch(data.image.url)).arrayBuffer()));
  console.log("✓ cut", out);
};

const stage = process.argv[2] ?? "1";
if (stage === "1") {
  await Promise.all([
    run("openai/gpt-image-2/edit", { prompt: EDIT("Remove the person's right forearm and hand from the keyboard entirely: the right arm now hangs down out of frame below the desk edge, so the keyboard is fully visible and empty. The back of the head, the beanie, the yellow shoulder, the laptop, the dark screen and the mug stay exactly as they are."), image_urls: [await upload(C)], image_size: { width: 2048, height: 1152 }, ...HQ }, { scene: "frames", name: "C-nohand" }),
    run("openai/gpt-image-2/edit", {
      prompt: [`Paint ONLY the person's right hand and forearm from the FIRST image, isolated on a flat, even, pale grey background (#D8D8D8) with nothing else in the picture. Same viewpoint as the FIRST image (from behind and slightly above, over the shoulder): the open hand is raised, palm facing down and away from us, fingers spread and slightly curled, ready to slap something on the desk. The forearm runs straight down from the wrist to the bottom edge of the image and is cut off by it. Same lilac-violet skin with one darker violet shadow tone, same crayon / oil-pastel texture, no outlines. Portrait image, the hand in the upper half, centred.`, STYLE, NO_TEXT].join("\n\n"),
      image_urls: [await upload(C), await upload(sheet)], image_size: { width: 1024, height: 1536 }, ...HQ,
    }, { scene: "hand", name: "hand-hover" }),
  ]);
  await cut("assets/hand/hand-hover.png", "assets/hand/hand-hover-cut.png");
} else {
  await run("openai/gpt-image-2/edit", {
    prompt: EDIT("The hand now SLAMS down: fingers splayed flat and wide, the palm flattened as if smacking a table at full force, with a short violent dry-brush motion smear trailing upward from the fingertips. Same position, same size, same forearm, same flat pale grey background."),
    image_urls: [await upload("assets/hand/hand-hover.png")], image_size: { width: 1024, height: 1536 }, ...HQ,
  }, { scene: "hand", name: "hand-slap" });
  await cut("assets/hand/hand-slap.png", "assets/hand/hand-slap-cut.png");
}
