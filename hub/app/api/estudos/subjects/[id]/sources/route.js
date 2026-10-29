import { registerFile, registerText, registerUrl, processSource } from "@/lib/atlas/ingest.js";
import { ok, fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const POST = route(async (req, { id }) => {
  const ct = req.headers.get("content-type") || "";
  const jobs = [];
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    for (const f of form.getAll("files")) {
      if (typeof f === "string" || !f.size) continue;
      const sid = registerFile(id, { buffer: Buffer.from(await f.arrayBuffer()), filename: f.name, mime: f.type });
      jobs.push({ source: sid, job: processSource(sid) });
    }
    const text = form.get("text");
    if (typeof text === "string" && text.trim()) {
      const sid = registerText(id, { title: form.get("title") || "Texto colado", text });
      jobs.push({ source: sid, job: processSource(sid) });
    }
    const url = form.get("url");
    if (typeof url === "string" && /^https?:\/\//.test(url.trim())) {
      const sid = registerUrl(id, url.trim());
      jobs.push({ source: sid, job: processSource(sid) });
    }
  } else {
    const b = await req.json();
    if (b.text) {
      const sid = registerText(id, { title: b.title, text: b.text });
      jobs.push({ source: sid, job: processSource(sid) });
    } else if (b.url) {
      const sid = registerUrl(id, b.url);
      jobs.push({ source: sid, job: processSource(sid) });
    }
  }
  if (!jobs.length) return fail("Nada para adicionar.");
  return ok({ jobs });
});
