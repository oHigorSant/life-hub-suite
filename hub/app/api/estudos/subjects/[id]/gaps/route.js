import { computeGaps } from "@/lib/atlas/progress.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => ok(computeGaps(id)));
