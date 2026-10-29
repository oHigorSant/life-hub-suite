// Verificador pedagógico: "ensinar antes de cobrar".
// Percorre os passos na ordem em que o aluno os vê. Um conceito só é considerado ENSINADO depois de aparecer
// num card `read` (no bloco de código, em `negrito` ou entre crases). Exercícios (query/quiz/fill/order) que usam
// um conceito ainda não ensinado são violações. Também checa o ritmo: toda lição começa com `read`, e nenhuma
// lição introduz conceitos demais de uma vez.
// Uso: node scripts/check-pedagogy.mjs [trilha] [--warn]   (sai com código 1 se houver violações)
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTrack } from './build-tracks.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const MAX_NEW_PER_LESSON = 4;

// id -> [regex sobre SQL sem strings/comentários, rótulo legível]
const C = {
  select: [/\bselect\b/, 'SELECT'], from: [/\bfrom\b/, 'FROM'], where: [/\bwhere\b/, 'WHERE'],
  and: [/\band\b/, 'AND'], or: [/\bor\b/, 'OR'], not: [/\bnot\b(?!\s+null)/, 'NOT'], in: [/\bin\s*\(/, 'IN'],
  between: [/\bbetween\b/, 'BETWEEN'], like: [/\blike\b/, 'LIKE'], isnull: [/\bis\s+(not\s+)?null\b/, 'IS NULL'],
  distinct: [/\bdistinct\b/, 'DISTINCT'], orderby: [/\border\s+by\b/, 'ORDER BY'], limit: [/\blimit\b/, 'LIMIT'],
  offset: [/\boffset\b/, 'OFFSET'], as: [/\bas\b(?!\s*(integer|text|real))/, 'AS'],
  count: [/\bcount\s*\(/, 'COUNT'], sum: [/\bsum\s*\(/, 'SUM'], avg: [/\bavg\s*\(/, 'AVG'], min: [/\bmin\s*\(/, 'MIN'], max: [/\bmax\s*\(/, 'MAX'],
  groupby: [/\bgroup\s+by\b/, 'GROUP BY'], having: [/\bhaving\b/, 'HAVING'], round: [/\bround\s*\(/, 'ROUND'],
  upper: [/\bupper\s*\(/, 'UPPER'], lower: [/\blower\s*\(/, 'LOWER'], length: [/\blength\s*\(/, 'LENGTH'], substr: [/\bsubstr\s*\(/, 'SUBSTR'],
  trim: [/\btrim\s*\(/, 'TRIM'], replace: [/\breplace\s*\(/, 'REPLACE'], instr: [/\binstr\s*\(/, 'INSTR'], concat: [/\|\|/, '||'],
  coalesce: [/\b(coalesce|ifnull)\s*\(/, 'COALESCE/IFNULL'], abs: [/\babs\s*\(/, 'ABS'],
  strftime: [/\bstrftime\s*\(/, 'STRFTIME'], date: [/\b(date|datetime|julianday)\s*\(/, 'DATE/JULIANDAY'],
  case: [/\bcase\b/, 'CASE'], join: [/\bjoin\b/, 'JOIN'], leftjoin: [/\bleft\s+(outer\s+)?join\b/, 'LEFT JOIN'],
  insert: [/\binsert\s+into\b/, 'INSERT'], update: [/\bupdate\b/, 'UPDATE'], delete: [/\bdelete\s+from\b/, 'DELETE'],
  createtable: [/\bcreate\s+table\b/, 'CREATE TABLE'], altertable: [/\balter\s+table\b/, 'ALTER TABLE'], droptable: [/\bdrop\s+table\b/, 'DROP TABLE'],
  subquery: [/\(\s*select\b/, 'subconsulta'], exists: [/\bexists\b/, 'EXISTS'], with: [/\bwith\s+\w+\s+as\b/, 'WITH (CTE)'],
  over: [/\bover\s*\(/, 'OVER'], rownumber: [/\brow_number\s*\(/, 'ROW_NUMBER'], rank: [/\b(dense_)?rank\s*\(/, 'RANK'], lag: [/\b(lag|lead)\s*\(/, 'LAG/LEAD'],
  union: [/\bunion\b/, 'UNION'], intersect: [/\bintersect\b/, 'INTERSECT'], except: [/\bexcept\b/, 'EXCEPT'],
  createview: [/\bcreate\s+view\b/, 'CREATE VIEW'], createindex: [/\bcreate\s+(unique\s+)?index\b/, 'CREATE INDEX'],
};
// Conceitos "de ambiente" que não exigimos ter sido ensinados em separado.
const IMPLIED = { not: ['isnull'] };

const strip = (s) => String(s || '').replace(/--[^\n]*/g, ' ').replace(/'(?:[^']|'')*'/g, "''").toLowerCase();
const found = (text) => Object.keys(C).filter((k) => C[k][0].test(strip(text)));

// Texto "didático" de um read: código + `crases` + **negrito**
function taughtText(step) {
  const b = step.body || '';
  const bits = [step.code || ''];
  for (const m of b.matchAll(/`([^`]+)`|\*\*([^*]+)\*\*/g)) bits.push(m[1] || m[2]);
  return bits.join('\n');
}

// SQL que o exercício exige/mostra
function sqlOf(step) {
  const bits = [];
  if (step.type === 'query') {
    bits.push(step.solution, step.starter);
    for (const m of (step.prompt || '').matchAll(/`([^`]+)`/g)) bits.push(m[1]);
  } else if (step.type === 'quiz') {
    bits.push(step.code);
    for (const o of step.options || []) if (/^\s*(select|insert|update|delete|create|with)\b/i.test(o)) bits.push(o);
  } else if (step.type === 'fill') bits.push(step.code, ...(step.answer || []));
  else if (step.type === 'order') bits.push(...(step.lines || []));
  return bits.filter(Boolean).join('\n');
}

let errors = 0, warns = 0;
for (const d of readdirSync(join(root, 'tracks'), { withFileTypes: true })) {
  if (!d.isDirectory() || (only && d.name !== only)) continue;
  const t = await loadTrack(d.name);
  if (t.language !== 'sql') { console.log(`${t.id}: (verificação de conceitos só para SQL)`); continue; }
  const taught = new Set();
  for (const ch of t.chapters) {
    for (const l of ch.lessons) {
      const where = (i) => `${ch.id}/${l.id}#${i + 1}`;
      if (l.steps[0]?.type !== 'read') { errors++; console.log(`  ✗ ${ch.id}/${l.id}: a lição deve começar com um card de leitura`); }
      let introduced = new Set();
      l.steps.forEach((s, i) => {
        if (s.type === 'read') {
          for (const k of found(taughtText(s))) if (!taught.has(k)) { taught.add(k); introduced.add(k); }
          return;
        }
        for (const k of found(sqlOf(s))) {
          const ok = taught.has(k) || (IMPLIED.not && k === 'not' && false);
          if (!ok) { errors++; console.log(`  ✗ ${where(i)} (${s.type}) usa ${C[k][1]} antes de ser ensinado`); }
        }
      });
      if (introduced.size > MAX_NEW_PER_LESSON) { warns++; console.log(`  ! ${ch.id}/${l.id}: ${introduced.size} conceitos novos de uma vez (${[...introduced].map((k) => C[k][1]).join(', ')})`); }
      const interactive = l.steps.filter((s) => s.type !== 'read').length;
      if (interactive < 3) { warns++; console.log(`  ! ${ch.id}/${l.id}: só ${interactive} passos de prática`); }
    }
  }
  console.log(`${t.id}: ${errors} violação(ões), ${warns} aviso(s)`);
}
process.exit(errors ? 1 : 0);
