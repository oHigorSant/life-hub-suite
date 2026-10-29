import { listVoices } from "@/lib/atlas/tts.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async () => ok(await listVoices()));
