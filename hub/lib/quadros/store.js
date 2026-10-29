import fs from "node:fs";
import path from "node:path";
import { generateId } from "../ids.js";

// Quadros do Excalidraw: um arquivo por quadro em data/quadros.
//   <id>.json       -> cena completa { elements, appState, files }
//   <id>.meta.json  -> { id, name, createdAt, updatedAt, elements } (listagem barata)
export const QUADROS_DIR = process.env.QUADROS_DIR || path.join(process.cwd(), "data", "quadros");
fs.mkdirSync(QUADROS_DIR, { recursive: true });

const ID_RE = /^quadro_[a-z0-9]{8}$/;
const MAX_BYTES = 80 * 1024 * 1024;

export function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function scenePath(id) {
  if (!ID_RE.test(String(id))) throw fail("Id de quadro inválido.");
  return path.join(QUADROS_DIR, `${id}.json`);
}
function metaPath(id) {
  scenePath(id);
  return path.join(QUADROS_DIR, `${id}.meta.json`);
}

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, file);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function listBoards() {
  const out = [];
  for (const f of fs.readdirSync(QUADROS_DIR)) {
    if (!f.endsWith(".meta.json")) continue;
    try { out.push(readJson(path.join(QUADROS_DIR, f))); } catch { /* meta corrompida: ignora */ }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function createBoard(name) {
  const id = generateId("quadro");
  const now = new Date().toISOString();
  const meta = { id, name: String(name || "Quadro sem nome").trim().slice(0, 100) || "Quadro sem nome", createdAt: now, updatedAt: now, elements: 0 };
  atomicWrite(scenePath(id), JSON.stringify({ type: "excalidraw", version: 2, elements: [], appState: {}, files: {} }));
  atomicWrite(metaPath(id), JSON.stringify(meta));
  return meta;
}

export function readBoard(id) {
  const sp = scenePath(id);
  if (!fs.existsSync(sp)) throw fail("Quadro não encontrado.", 404);
  return { meta: readJson(metaPath(id)), scene: readJson(sp) };
}

const APP_KEYS = ["viewBackgroundColor", "gridSize", "scrollX", "scrollY", "zoom", "theme"];

/** Salva a cena (só os campos de appState que importam para reabrir igual) e/ou renomeia. */
export function saveBoard(id, { name, scene } = {}) {
  const sp = scenePath(id);
  if (!fs.existsSync(sp)) throw fail("Quadro não encontrado.", 404);
  const meta = readJson(metaPath(id));
  if (typeof name === "string" && name.trim()) meta.name = name.trim().slice(0, 100);
  if (scene) {
    const elements = Array.isArray(scene.elements) ? scene.elements.filter((e) => !e?.isDeleted) : [];
    const app = {};
    for (const k of APP_KEYS) if (scene.appState && scene.appState[k] !== undefined) app[k] = scene.appState[k];
    const files = scene.files && typeof scene.files === "object" ? scene.files : {};
    const text = JSON.stringify({ type: "excalidraw", version: 2, elements, appState: app, files });
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw fail("Quadro grande demais (máx. 80 MB).", 413);
    atomicWrite(sp, text);
    meta.elements = elements.length;
  }
  meta.updatedAt = new Date().toISOString();
  atomicWrite(metaPath(id), JSON.stringify(meta));
  return meta;
}

/** Vai para a lixeira (data/quadros/.lixeira), recuperável. */
export function deleteBoard(id) {
  const sp = scenePath(id);
  if (!fs.existsSync(sp)) throw fail("Quadro não encontrado.", 404);
  const trash = path.join(QUADROS_DIR, ".lixeira");
  fs.mkdirSync(trash, { recursive: true });
  const stamp = Date.now();
  fs.renameSync(sp, path.join(trash, `${stamp}-${id}.json`));
  fs.renameSync(metaPath(id), path.join(trash, `${stamp}-${id}.meta.json`));
}
