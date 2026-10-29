import fs from "node:fs";
import path from "node:path";

// Cofre de notas: arquivos .md em data/notas (fonte da verdade, estilo Obsidian).
// Metadados do app (áreas e visões do grafo) ficam em data/notas/.meta/*.json.
export const NOTAS_DIR = process.env.NOTAS_DIR || path.join(process.cwd(), "data", "notas");
export const META_DIR = path.join(NOTAS_DIR, ".meta");
export const AREAS_FILE = path.join(META_DIR, "areas.json");
export const VIEWS_FILE = path.join(META_DIR, "views.json");

fs.mkdirSync(META_DIR, { recursive: true });

const MAX_NOTE_BYTES = 2 * 1024 * 1024;

export function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

/** Valida e resolve um caminho de nota dentro do cofre. Retorna { rel, abs }. */
export function safeNotePath(p) {
  let rel = String(p ?? "").replace(/\\/g, "/").replace(/^\/+/, "").trim();
  if (!rel) throw httpError("Caminho vazio.");
  if (!rel.toLowerCase().endsWith(".md")) rel += ".md";
  const parts = rel.split("/");
  if (parts.some((s) => !s || s === "." || s === ".." || s.startsWith("."))) throw httpError("Caminho inválido.");
  if (/[<>:"|?*\u0000-\u001f]/.test(rel)) throw httpError("Caracteres inválidos no nome.");
  const base = path.resolve(NOTAS_DIR);
  const abs = path.resolve(base, rel);
  if (!abs.startsWith(base + path.sep)) throw httpError("Caminho inválido.");
  return { rel, abs };
}

export function checkSize(text) {
  if (Buffer.byteLength(String(text ?? ""), "utf8") > MAX_NOTE_BYTES) throw httpError("Nota grande demais (máx. 2 MB).", 413);
}
