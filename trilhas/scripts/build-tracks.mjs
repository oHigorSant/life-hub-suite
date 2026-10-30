// Monta tracks-built/<id>.json a partir de tracks/<id>/{meta,ch*,dataset}.js
// e copia as trilhas prontas geradas por IA de tracks-ai/*.json (sem sobrescrever as que já existem).
import { readdirSync, mkdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tracks-built');
mkdirSync(out, { recursive: true });

export async function loadTrack(id) {
  const dir = join(root, 'tracks', id);
  const imp = (f) => import(pathToFileURL(join(dir, f)).href);
  const meta = (await imp('meta.js')).default;
  const files = readdirSync(dir).filter((f) => /^ch\d+\.js$/.test(f)).sort();
  const chapters = [];
  for (const f of files) chapters.push((await imp(f)).default);
  let dataset = null;
  if (existsSync(join(dir, 'dataset.js'))) dataset = (await imp('dataset.js')).DATASET;
  return { ...meta, dataset, chapters };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const d of readdirSync(join(root, 'tracks'), { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const t = await loadTrack(d.name);
    writeFileSync(join(out, `${t.id}.json`), JSON.stringify(t));
    const steps = t.chapters.reduce((n, c) => n + c.lessons.reduce((m, l) => m + l.steps.length, 0), 0);
    console.log(`${t.id}: ${t.chapters.length} capítulos, ${steps} passos`);
  }
  const ai = join(root, 'tracks-ai');
  for (const f of existsSync(ai) ? readdirSync(ai).filter((x) => x.endsWith('.json')) : []) {
    if (existsSync(join(out, f))) continue; // a cópia local pode ter sido editada/refeita: não sobrescreve
    copyFileSync(join(ai, f), join(out, f));
    console.log(`${f}: trilha pronta copiada de tracks-ai/`);
  }
}
