import { registerFile, registerText, registerUrl, processSource } from "@/lib/atlas/ingest.js";
import { buildSubject } from "@/lib/atlas/build.js";
import { ok, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

// Registra os materiais (opcionais) e dispara o pipeline completo: ler → mapear conhecimento → árvore.
export const POST = route(async (req, { id }) => {
  const ids = [];
  let prompt = "";
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    prompt = String(form.get("prompt") || "");
    for (const f of form.getAll("files")) {
      if (typeof f === "string" || !f.size) continue;
      ids.push(processSource(registerFile(id, { buffer: Buffer.from(await f.arrayBuffer()), filename: f.name, mime: f.type })));
    }
    const text = form.get("text");
    if (typeof text === "string" && text.trim()) ids.push(processSource(registerText(id, { title: form.get("title") || "Texto colado", text })));
    const url = form.get("url");
    if (typeof url === "string" && /^https?:\/\//.test(url.trim())) ids.push(processSource(registerUrl(id, url.trim())));
  } else {
    prompt = (await req.json().catch(() => ({}))).prompt || "";
  }
  return ok({ job: buildSubject(id, ids, { prompt }) });
});
