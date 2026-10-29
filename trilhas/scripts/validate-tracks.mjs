// Valida todas as trilhas: estrutura dos passos + cada exercício SQL deve passar com a própria solução
// e FALHAR com o starter vazio (para não existir exercício que já nasce resolvido).
// Uso: node scripts/validate-tracks.mjs [id-da-trilha] [capitulo-ex: basico]
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadTrack } from './build-tracks.mjs';
import { gradeQuery } from '../shared/grade.js';

const require = createRequire(import.meta.url);
const initSqlJs = require('sql.js');
const SQL = await initSqlJs();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [onlyTrack, onlyChapter] = process.argv.slice(2);

let errors = 0;
const bad = (where, msg) => { errors++; console.log(`  ✗ ${where}: ${msg}`); };

const TYPES = new Set(['read', 'quiz', 'fill', 'order', 'match', 'input', 'query']);

for (const d of readdirSync(join(root, 'tracks'), { withFileTypes: true })) {
  if (!d.isDirectory() || (onlyTrack && d.name !== onlyTrack)) continue;
  const t = await loadTrack(d.name);
  const ids = new Set();
  let total = 0;
  for (const c of t.chapters) {
    if (onlyChapter && c.id !== onlyChapter) continue;
    for (const l of c.lessons) {
      if (ids.has(l.id)) bad(l.id, 'id de lição duplicado');
      ids.add(l.id);
      if (l.steps.length < 4) bad(l.id, 'lição com menos de 4 passos');
      l.steps.forEach((s, i) => {
        total++;
        const w = `${c.id}/${l.id}#${i + 1}`;
        if (!TYPES.has(s.type)) return bad(w, `tipo inválido ${s.type}`);
        if (s.type === 'quiz') {
          if (!Array.isArray(s.options) || s.options.length < 2) bad(w, 'quiz sem opções');
          if (!Number.isInteger(s.answer) || s.answer < 0 || s.answer >= (s.options || []).length) bad(w, 'answer fora do intervalo');
        }
        if (s.type === 'fill') {
          const blanks = (s.code.match(/___/g) || []).length;
          if (blanks !== s.answer.length) bad(w, `${blanks} lacunas mas ${s.answer.length} respostas`);
          for (const a of s.answer) if (!s.bank.includes(a)) bad(w, `resposta "${a}" ausente do bank`);
        }
        if (s.type === 'order' && (!s.lines || s.lines.length < 2)) bad(w, 'order precisa de 2+ linhas');
        if (s.type === 'input' && (!Array.isArray(s.answers) || !s.answers.length)) bad(w, 'input precisa de answers');
        if (s.type === 'match' && (!s.pairs || s.pairs.length < 2)) bad(w, 'match precisa de 2+ pares');
        if (s.type === 'query') {
          if (!s.solution) return bad(w, 'sem solution');
          const ok = gradeQuery(SQL, s, t.dataset, s.solution);
          if (!ok.ok) bad(w, `a própria solução não passa: ${ok.error || ok.reason}`);
          if (ok.ok && !s.verify && !ok.result) bad(w, 'solução não devolve resultado e não há `verify`');
          const empty = gradeQuery(SQL, s, t.dataset, s.starter && /^[\s\S]*;\s*$/.test(s.starter) ? s.starter : 'SELECT 1 WHERE 0;');
          if (empty.ok) bad(w, 'um SQL vazio/inútil já passa nesse exercício');
        }
      });
    }
  }
  console.log(`${t.id}: ${total} passos verificados`);
}
console.log(errors ? `\n${errors} problema(s)` : '\nTudo certo ✔');
process.exit(errors ? 1 : 0);
