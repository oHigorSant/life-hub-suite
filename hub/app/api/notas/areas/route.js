import { readAreas, writeAreas, sanitizeAreas } from "@/lib/notas/store.js";
import { json, handle, body } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ areas: readAreas() }));

// PUT { areas: [...] } -> substitui a hierarquia (cores, bordas, ícones, pais)
export const PUT = handle(async (request) => {
  const b = await body(request);
  const areas = sanitizeAreas(b.areas);
  writeAreas(areas);
  return json({ areas });
});
