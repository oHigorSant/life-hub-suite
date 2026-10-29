import { generateAudio } from "@/lib/atlas/activities.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => {
  const b = await req.json().catch(() => ({}));
  return ok({ job: generateAudio(id, { voiceA: b.voiceA, voiceB: b.voiceB, speed: b.speed }) });
});
