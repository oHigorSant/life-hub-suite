// node scripts/ingles-build.mjs  → gera data/ingles/lessons.json a partir de data/ingles/catalog.json
import fs from "node:fs";
import path from "node:path";
import { buildLessons, DATA_DIR, LESSONS_FILE } from "../lib/ingles/lessons.js";

const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "catalog.json"), "utf8"));
const gramFile = path.join(DATA_DIR, "gramatica.json");
const gram = fs.existsSync(gramFile) ? JSON.parse(fs.readFileSync(gramFile, "utf8")) : null;
const out = buildLessons(catalog, gram);
fs.writeFileSync(LESSONS_FILE, JSON.stringify(out));

const audioDir = path.join(process.cwd(), "public", "course_audios");
const missing = [];
for (const l of out.lessons) for (const a of l.audios) if (fs.existsSync(audioDir) && !fs.existsSync(path.join(audioDir, a.file))) missing.push(a.file);
const empty = out.lessons.filter((l) => !l.blocks.length);
console.log(`${out.lessons.length} lições em ${out.groups.length} grupos`);
console.log(`sem texto: ${empty.length}`, empty.map((l) => l.id).join(", "));
console.log(`áudios ausentes: ${missing.length}`, missing.slice(0, 5));
const byKind = {};
for (const l of out.lessons) byKind[l.kind] = (byKind[l.kind] || 0) + 1;
console.log(byKind);
