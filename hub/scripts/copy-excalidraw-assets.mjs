// Copia as fontes do Excalidraw para public/excalidraw-assets (assim ele não depende de CDN).
// Roda sozinho antes do build/dev (scripts "prebuild"/"predev" no package.json).
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "node_modules", "@excalidraw", "excalidraw", "dist");
const candidates = [path.join(root, "prod", "fonts"), path.join(root, "dev", "fonts"), path.join(root, "fonts")];
const src = candidates.find((p) => fs.existsSync(p));
if (!src) {
  console.log("[excalidraw] pasta de fontes não encontrada; o Excalidraw vai usar a CDN padrão.");
  process.exit(0);
}
const dst = path.join(process.cwd(), "public", "excalidraw-assets", "fonts");
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true });
console.log(`[excalidraw] fontes copiadas de ${path.relative(process.cwd(), src)}`);
