import fs from "node:fs";
import { previewVoice } from "@/lib/atlas/tts.js";
import { fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const b = await req.json();
  if (!b.voice) return fail("Escolha uma voz.");
  const file = await previewVoice({ voice: b.voice, speed: b.speed });
  return new Response(fs.readFileSync(file), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
});
