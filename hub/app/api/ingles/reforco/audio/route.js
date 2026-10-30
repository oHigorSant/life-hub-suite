import fs from "node:fs";
import { audioPath } from "@/lib/ingles/reforco";

export const dynamic = "force-dynamic";

/** mp3 do estudo de reforço, com suporte a Range (o player pula para cada frase). */
export async function GET(req) {
  const file = new URL(req.url).searchParams.get("f");
  const p = audioPath(file);
  if (!p) return new Response("Não encontrado", { status: 404 });
  const size = fs.statSync(p).size;
  const range = req.headers.get("range");
  const m = range && range.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new Response(fs.readFileSync(p).subarray(start, end + 1), {
      status: 206,
      headers: { "content-type": "audio/mpeg", "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "content-length": String(end - start + 1), "cache-control": "private, max-age=86400" },
    });
  }
  return new Response(fs.readFileSync(p), { headers: { "content-type": "audio/mpeg", "accept-ranges": "bytes", "content-length": String(size), "cache-control": "private, max-age=86400" } });
}
