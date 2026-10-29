import fs from "node:fs";
import path from "node:path";
import { AUDIO_DIR } from "@/lib/atlas/tts.js";

export const dynamic = "force-dynamic";

// Stream com suporte a Range (necessário para seek e reprodução em celular/iOS).
export async function GET(req, { params }) {
  const { id } = await params;
  if (!/^[\w-]+$/.test(id)) return new Response("not found", { status: 404 });
  const file = path.join(AUDIO_DIR, `${id}.mp3`);
  if (!fs.existsSync(file)) return new Response("not found", { status: 404 });
  const size = fs.statSync(file).size;
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  const headers = { "content-type": "audio/mpeg", "accept-ranges": "bytes", "cache-control": "private, max-age=86400" };
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : size - Number(range[2]);
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    const stream = fs.createReadStream(file, { start, end });
    return new Response(stream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(fs.createReadStream(file), { headers: { ...headers, "content-length": String(size) } });
}
