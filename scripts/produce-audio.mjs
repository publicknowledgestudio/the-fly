// Sound design via ElevenLabs sound effects on fal. Short, dry, close-miked —
// the picture is flat and painterly, so the sound carries the physicality.
import { mkdir, writeFile, access } from "node:fs/promises";
import { fal } from "../lib/fal.mjs";

await mkdir("assets/audio", { recursive: true });
const SFX = {
  "buzz-loop":   { text: "A single housefly buzzing continuously very close to a microphone, steady wingbeat drone, no other sounds", duration_seconds: 4, loop: true },
  "room-loop":   { text: "Quiet home office on a sunny afternoon: soft room tone, very distant birdsong through a closed window, a faint laptop fan. Calm and still.", duration_seconds: 12, loop: true },
  "typing-loop": { text: "Calm, steady typing on a laptop keyboard, soft plastic keys, unhurried, close", duration_seconds: 6, loop: true },
  "swish":       { text: "A quick hand swishing through the air to swat a fly, short whoosh", duration_seconds: 0.6 },
  "thwack":      { text: "A flat open palm slamming hard onto a laptop, loud plastic THWACK with a rattle of the keyboard, then silence", duration_seconds: 1.5 },
  "key-dead":    { text: "A single laptop key pressed slowly, one soft plastic click, nothing else", duration_seconds: 0.6 },
  "boot":        { text: "A laptop restarting: fan spins up, a soft electronic startup hum, hard drive whirr", duration_seconds: 4 },
  "error":       { text: "A soft, dull, two-note computer error chime, descending, disappointing", duration_seconds: 1.2 },
};

const exists = (p) => access(p).then(() => true, () => false);
const results = await Promise.allSettled(Object.entries(SFX).map(async ([name, input]) => {
  const file = `assets/audio/${name}.mp3`;
  if (await exists(file)) return console.log(`• ${name} exists`);
  const { data } = await fal.subscribe("fal-ai/elevenlabs/sound-effects/v2", { input: { ...input, prompt_influence: 0.55, output_format: "mp3_44100_128" } });
  await writeFile(file, Buffer.from(await (await fetch(data.audio.url)).arrayBuffer()));
  console.log(`✓ ${name}`);
}));
results.forEach((r, i) => r.status === "rejected" && console.log(`✗ ${Object.keys(SFX)[i]}: ${r.reason?.message} ${JSON.stringify(r.reason?.body ?? "").slice(0, 300)}`));
