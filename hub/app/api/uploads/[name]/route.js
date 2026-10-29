import { promises as fs } from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

// Serve arquivos enviados (imagens de fundo dos quadros, anexos). Só dentro de uploads/, e só tipos seguros
// para exibir no navegador (SVG fica de fora de propósito: pode carregar script).
const TYPES = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8" };

export async function GET(_request, { params }) {
  const { name } = await params;
  const file = path.basename(decodeURIComponent(String(name)));
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!type || file.startsWith(".")) return new Response("Tipo não permitido.", { status: 415 });
  try {
    const buf = await fs.readFile(path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, file));
    return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Não encontrado.", { status: 404 });
  }
}
