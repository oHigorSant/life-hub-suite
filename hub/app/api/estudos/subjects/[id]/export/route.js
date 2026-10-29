import { exportVault } from "@/lib/atlas/kb.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => ok({ path: exportVault(id) }));
