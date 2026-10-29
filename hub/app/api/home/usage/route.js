import { json, handle } from "@/lib/notas/http.js";
import { readUsage } from "@/lib/home/usage.js";

export const dynamic = "force-dynamic";

// GET /api/home/usage -> { windows: [{ type, label, percent, resetsAt, expired, status }], updatedAt, now }
export const GET = handle(async () => json(await readUsage()));
