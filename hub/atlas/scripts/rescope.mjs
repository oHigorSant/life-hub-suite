#!/usr/bin/env node
// Recalcula o escopo progressivo (onde cada nó é ensinado) de uma ou todas as áreas.
// Uso: node --no-warnings scripts/rescope.mjs [subjectId|all] [--reset-content]
// --reset-content apaga atividades/questões/cartões/respostas gerados com o escopo antigo (faz backup antes).
import fs from "node:fs";
import path from "node:path";
const { db } = await import("../../lib/atlas/db.js");
const { rescopeSubject } = await import("../../lib/atlas/roadmap.js");
const { DATA_DIR } = await import("../../lib/atlas/paths.js");
const { AUDIO_DIR } = await import("../../lib/atlas/tts.js");

const [target = "all", ...flags] = process.argv.slice(2);
const d = db();
const subjects = d.prepare("SELECT id, title FROM subjects").all().filter((s) => target === "all" || s.id === target);

if (flags.includes("--reset-content")) {
  d.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  fs.mkdirSync(path.join(DATA_DIR, "backups"), { recursive: true });
  const bk = path.join(DATA_DIR, "backups", `atlas-${Date.now()}.db`);
  fs.copyFileSync(path.join(DATA_DIR, "atlas.db"), bk);
  console.log("backup:", bk);
}
for (const s of subjects) {
  const stats = rescopeSubject(s.id);
  console.log(s.title, stats);
  if (flags.includes("--reset-content")) {
    for (const a of d.prepare("SELECT id FROM activities WHERE subject_id=? AND type='podcast'").all(s.id)) fs.rmSync(path.join(AUDIO_DIR, `${a.id}.mp3`), { force: true });
    for (const t of ["attempts", "questions", "reviews", "cards", "activities", "node_state"]) {
      const sql = t === "reviews" ? "DELETE FROM reviews WHERE card_id IN (SELECT id FROM cards WHERE subject_id=?)" : `DELETE FROM ${t} WHERE subject_id=?`;
      d.prepare(sql).run(s.id);
    }
  }
}
process.exit(0);
