import { buildGraph } from "@/lib/notas/graph.js";
import { json, handle } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json(buildGraph()));
