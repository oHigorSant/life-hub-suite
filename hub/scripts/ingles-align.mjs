// node scripts/ingles-align.mjs [pasta-whisper]  → gera data/ingles/align/<lição>.json (tempo de cada palavra, por áudio)
// A pasta do Whisper tem um JSON por mp3 (C:\vps-local\ingles\align no Windows; data/ingles/whisper na VM).
import fs from "node:fs";
import path from "node:path";
import { loadLessons, DATA_DIR } from "../lib/ingles/lessons.js";
import { lessonTokens } from "../lib/ingles/text.js";
import { alignWords, alignFromTimeline } from "../lib/ingles/align.js";

const src = process.argv[2] || path.join(DATA_DIR, "whisper");
const out = path.join(DATA_DIR, "align");
fs.mkdirSync(out, { recursive: true });
const { lessons } = loadLessons();
const only = process.argv[3] || "";
let done = 0, weak = [], missing = 0;
const t0 = Date.now();
for (const l of lessons) {
  if (only && !l.id.includes(only)) continue;
  const toks = lessonTokens(l.blocks);
  const keys = toks.map((t) => t.k);
  const res = { lesson: l.id, tokens: toks.length, audios: {} };
  for (const a of l.audios) {
    if (a.timeline) { // áudio sintetizado frase a frase: tempos exatos, sem depender do Whisper
      const { spans, coverage } = alignFromTimeline(toks, a.timeline);
      const dur = a.timeline.length ? a.timeline[a.timeline.length - 1][2] : 0;
      res.audios[a.file] = { duration: dur, language: "en", coverage, heard: toks.length, spans, source: "timeline" };
      done++;
      continue;
    }
    const f = path.join(src, a.file + ".json");
    if (!fs.existsSync(f)) { missing++; continue; }
    const w = JSON.parse(fs.readFileSync(f, "utf8"));
    const { spans, coverage } = alignWords(keys, w.words, w.duration);
    res.audios[a.file] = { duration: w.duration, language: w.language, coverage, heard: w.words.length, spans };
    // texto do curso não bate com a fala (aula improvisada): guarda o reconhecimento para o karaokê "ao vivo"
    // aulas faladas (professor explica em português e cita os exemplos): o karaokê segue a fala, não o slide
    if (coverage < 0.55 || l.kind === "lecture" || l.kind === "phrasal") res.audios[a.file].words = w.words.map((x) => [x[0], x[1], x[2]]);
    if (coverage < 0.55) weak.push(`${l.id} / ${a.label} cov=${coverage}`);
    done++;
  }
  if (Object.keys(res.audios).length) fs.writeFileSync(path.join(out, l.id + ".json"), JSON.stringify(res));
}
console.log(`alinhados ${done} áudios em ${((Date.now() - t0) / 1000).toFixed(1)}s; sem whisper: ${missing}`);
console.log(`cobertura < 55%: ${weak.length}`);
weak.slice(0, 40).forEach((w) => console.log("  ", w));
