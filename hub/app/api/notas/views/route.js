import { readViews, writeViews } from "@/lib/notas/store.js";
import { json, handle, body } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json(readViews()));

// PUT { views: [...], activeId } -> substitui todas as visões (validadas/saneadas)
export const PUT = handle(async (request) => json(writeViews(await body(request))));
