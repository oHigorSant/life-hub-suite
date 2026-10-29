import fs from "node:fs";
import path from "node:path";
import { db, parse, tx } from "./db.js";
import { UPLOADS_DIR, VAULT_DIR } from "./paths.js";
import { AUDIO_DIR } from "./tts.js";

/** Apaga a área e TUDO que depende dela (inclusive o que não tem FK: questões, cartões, eventos) e os arquivos em disco. */
export function deleteSubject(id) {
  const d = db();
  const subject = d.prepare("SELECT id, title FROM subjects WHERE id=?").get(id);
  if (!subject) return false;
  const sources = d.prepare("SELECT id FROM sources WHERE subject_id=?").all(id);
  const audios = d.prepare("SELECT id FROM activities WHERE subject_id=? AND type='podcast'").all(id);
  tx(() => {
    d.prepare("DELETE FROM attempts WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM questions WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM reviews WHERE card_id IN (SELECT id FROM cards WHERE subject_id=?)").run(id);
    d.prepare("DELETE FROM cards WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM activities WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM node_state WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM chat WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM events WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM jobs WHERE subject_id=?").run(id);
    d.prepare("DELETE FROM subjects WHERE id=?").run(id); // cascata: sources, chunks(+fts), concepts, nodes, edges...
  });
  for (const s of sources) fs.rmSync(path.join(UPLOADS_DIR, s.id), { recursive: true, force: true });
  for (const a of audios) fs.rmSync(path.join(AUDIO_DIR, `${a.id}.mp3`), { force: true });
  try {
    for (const dir of fs.readdirSync(VAULT_DIR)) if (dir.endsWith(`-${id.slice(-4)}`)) fs.rmSync(path.join(VAULT_DIR, dir), { recursive: true, force: true });
  } catch {}
  return true;
}
