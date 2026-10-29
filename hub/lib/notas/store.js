import fs from "node:fs";
import path from "node:path";
import { NOTAS_DIR, AREAS_FILE, VIEWS_FILE, META_DIR, safeNotePath, checkSize, httpError } from "./paths.js";
import { parseNote, slug, norm } from "./parse.js";
import { SEED_NOTES } from "./seed.js";
import { DEFAULT_VIEWS, sanitizeView } from "./views.js";

const g = globalThis;

function atomicWrite(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

function walk(dir, base = "") {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(abs, rel));
    else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
      const st = fs.statSync(abs);
      out.push({ rel, abs, mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return out;
}

// ---------------------------------------------------------------- notas
/** Primeira abertura: cria notas de exemplo (marcadas #exemplo) para mostrar a sintaxe e o grafo. */
export function seedIfEmpty() {
  const flag = path.join(META_DIR, ".seeded");
  if (fs.existsSync(flag)) return;
  if (walk(NOTAS_DIR).length === 0) {
    for (const n of SEED_NOTES) atomicWrite(path.join(NOTAS_DIR, n.path), n.content);
  }
  fs.writeFileSync(flag, new Date().toISOString());
}

export function loadNotes() {
  seedIfEmpty();
  const files = walk(NOTAS_DIR);
  const key = files.map((f) => `${f.rel}:${f.mtimeMs}:${f.size}`).join("|");
  if (g.__notasCache?.key === key) return g.__notasCache.notes;
  const notes = files.map((f) => {
    const raw = fs.readFileSync(f.abs, "utf8");
    return { ...parseNote(raw, f.rel), mtime: f.mtimeMs, size: f.size };
  });
  g.__notasCache = { key, notes };
  return notes;
}

export function readNote(p) {
  const { rel, abs } = safeNotePath(p);
  if (!fs.existsSync(abs)) throw httpError("Nota não encontrada.", 404);
  const raw = fs.readFileSync(abs, "utf8");
  const st = fs.statSync(abs);
  return { path: rel, raw, mtime: st.mtimeMs, meta: parseNote(raw, rel) };
}

export function writeNote(p, raw, { create = false } = {}) {
  const { rel, abs } = safeNotePath(p);
  checkSize(raw);
  if (create && fs.existsSync(abs)) throw httpError("Já existe uma nota com esse nome.", 409);
  atomicWrite(abs, String(raw ?? ""));
  const st = fs.statSync(abs);
  return { path: rel, mtime: st.mtimeMs, meta: parseNote(String(raw ?? ""), rel) };
}

export function deleteNote(p) {
  const { abs } = safeNotePath(p);
  if (!fs.existsSync(abs)) throw httpError("Nota não encontrada.", 404);
  // vai para uma lixeira dentro do cofre (recuperável), em vez de apagar de vez
  const trash = path.join(META_DIR, "lixeira");
  fs.mkdirSync(trash, { recursive: true });
  const dest = path.join(trash, `${Date.now()}-${path.basename(abs)}`);
  fs.renameSync(abs, dest);
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Move/renomeia e atualiza os [[links]] que apontavam para o nome antigo. */
export function renameNote(from, to) {
  const a = safeNotePath(from);
  const b = safeNotePath(to);
  if (!fs.existsSync(a.abs)) throw httpError("Nota não encontrada.", 404);
  if (fs.existsSync(b.abs)) throw httpError("Já existe uma nota com esse nome.", 409);
  const oldNote = parseNote(fs.readFileSync(a.abs, "utf8"), a.rel);
  fs.mkdirSync(path.dirname(b.abs), { recursive: true });
  fs.renameSync(a.abs, b.abs);
  const newBase = b.rel.split("/").pop().replace(/\.md$/i, "");
  const olds = [...new Set([oldNote.base, oldNote.title])];
  let updated = 0;
  for (const f of walk(NOTAS_DIR)) {
    let raw = fs.readFileSync(f.abs, "utf8");
    let changed = false;
    for (const o of olds) {
      const re = new RegExp(`\\[\\[\\s*${escapeRe(o)}\\s*((?:#[^\\]|]*)?)((?:\\|[^\\]]*)?)\\]\\]`, "gi");
      raw = raw.replace(re, (_m, anchor, alias) => { changed = true; return `[[${newBase}${anchor}${alias}]]`; });
    }
    if (changed) { atomicWrite(f.abs, raw); updated++; }
  }
  return { path: b.rel, updatedLinks: updated };
}

export function searchNotes(q, limit = 30) {
  const needle = norm(q);
  if (!needle) return [];
  const out = [];
  for (const f of walk(NOTAS_DIR)) {
    const raw = fs.readFileSync(f.abs, "utf8");
    const n = norm(raw);
    const idx = n.indexOf(needle);
    const meta = parseNote(raw, f.rel);
    const inTitle = norm(meta.title).includes(needle);
    if (idx < 0 && !inTitle) continue;
    let snippet = "";
    if (idx >= 0) {
      const start = Math.max(0, idx - 50);
      snippet = raw.slice(start, idx + needle.length + 90).replace(/\s+/g, " ").trim();
    }
    out.push({ path: f.rel, title: meta.title, snippet, score: (inTitle ? 2 : 0) + (idx >= 0 ? 1 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------- áreas (hierarquia)
const PALETTE = ["#0c66e4", "#1f845a", "#c9372c", "#b38600", "#8270db", "#e56910", "#2898bd", "#ae4787", "#5e6c84"];

export function readAreas() {
  try {
    const j = JSON.parse(fs.readFileSync(AREAS_FILE, "utf8"));
    return Array.isArray(j.areas) ? j.areas : [];
  } catch {
    return [];
  }
}
export function writeAreas(areas) {
  atomicWrite(AREAS_FILE, JSON.stringify({ areas }, null, 2) + "\n");
}

/** "Computação > Sistemas Operacionais > Windows" -> cria o que faltar; devolve o id da folha. */
export function ensureAreaPath(areas, str) {
  const segs = String(str ?? "").split(/\s*(?:\/|>|›|»)\s*/).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return { id: null, changed: false };
  let parent = null;
  let changed = false;
  for (const seg of segs) {
    const id = parent ? `${parent}/${slug(seg)}` : slug(seg);
    if (!areas.find((a) => a.id === id)) {
      const roots = areas.filter((a) => !a.parent).length;
      const parentArea = parent ? areas.find((a) => a.id === parent) : null;
      // filha: cor própria, deslocada na paleta a partir da cor do pai (irmãs ficam diferentes entre si)
      const siblings = areas.filter((a) => a.parent === parent).length;
      const color = parentArea ? PALETTE[(Math.max(0, PALETTE.indexOf(parentArea.color)) + 1 + siblings) % PALETTE.length] : PALETTE[roots % PALETTE.length];
      areas.push({ id, name: seg, parent, color, border: "dashed", icon: null, shape: null });
      changed = true;
    }
    parent = id;
  }
  return { id: parent, changed };
}

const AREA_SHAPES = ["ellipse", "round-rectangle", "rectangle", "diamond", "hexagon", "octagon", "star", "triangle", "pentagon", "tag", "round-tag", "vee", "barrel"];
export function sanitizeAreas(list) {
  const seen = new Set();
  const out = [];
  for (const a of Array.isArray(list) ? list : []) {
    const id = String(a?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(a.name ?? id).slice(0, 80),
      parent: a.parent && String(a.parent) !== id ? String(a.parent) : null,
      color: /^#[0-9a-f]{6}$/i.test(a.color ?? "") ? a.color : "#5e6c84",
      border: ["solid", "dashed", "dotted", "double"].includes(a.border) ? a.border : "dashed",
      icon: a.icon ? String(a.icon).slice(0, 30) : null,
      shape: AREA_SHAPES.includes(a.shape) ? a.shape : null,
    });
  }
  // remove pais inexistentes
  const ids = new Set(out.map((a) => a.id));
  for (const a of out) if (a.parent && !ids.has(a.parent)) a.parent = null;
  return out;
}

// ---------------------------------------------------------------- visões salvas
export function readViews() {
  try {
    const j = JSON.parse(fs.readFileSync(VIEWS_FILE, "utf8"));
    const views = (Array.isArray(j.views) ? j.views : []).map(sanitizeView);
    if (views.length) return { views, activeId: views.find((v) => v.id === j.activeId) ? j.activeId : views[0].id };
  } catch {}
  const views = DEFAULT_VIEWS.map(sanitizeView);
  return { views, activeId: views[0].id };
}
export function writeViews(payload) {
  const views = (Array.isArray(payload?.views) ? payload.views : []).map(sanitizeView);
  if (!views.length) throw httpError("É preciso ter ao menos uma visão.");
  const activeId = views.find((v) => v.id === payload.activeId) ? payload.activeId : views[0].id;
  atomicWrite(VIEWS_FILE, JSON.stringify({ views, activeId }, null, 2) + "\n");
  return { views, activeId };
}
