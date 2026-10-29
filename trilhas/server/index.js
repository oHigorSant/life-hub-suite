import express from 'express';
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startGeneration, getJob, aiHint, claudeAvailable } from './generate.js';
import { chat, getHistory, clearHistory } from './mentor.js';
import { listNotes, createNote, updateNote, deleteNote, syncPending } from './notes.js';
import { hubAvailable } from './hub.js';
import { createTrack, addLessons, deleteTrack } from './custom.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const builtDir = join(root, 'tracks-built');
const dataDir = join(root, 'data');
const progressFile = join(dataDir, 'progress.json');
mkdirSync(builtDir, { recursive: true });
mkdirSync(dataDir, { recursive: true });

const app = express();
// Atrás do Life Hub o app é servido em /trilhas-app/...; o prefixo é removido aqui (o acesso direto na raiz continua valendo).
app.use((req, _res, next) => {
  if (req.url === '/trilhas-app' || req.url.startsWith('/trilhas-app/') || req.url.startsWith('/trilhas-app?')) {
    const rest = req.url.slice('/trilhas-app'.length);
    req.url = rest.startsWith('/') ? rest : `/${rest}`;
    req.originalUrl = req.url; // senão o express.static tenta "corrigir" a barra final e entra em loop com o Next
  }
  next();
});
app.use(express.json({ limit: '3mb' }));

// Jobs de geração vivem em memória: se o servidor reiniciou no meio, a trilha ficaria marcada como 'gerando' para sempre.
for (const f of readdirSync(builtDir).filter((x) => x.endsWith('.json'))) {
  const p = join(builtDir, f);
  const t = JSON.parse(readFileSync(p, 'utf8'));
  if (t.generating) { delete t.generating; t.incomplete = true; writeFileSync(p, JSON.stringify(t)); }
}

const readTrack = (id) => {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const f = join(builtDir, `${id}.json`);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
};

app.get('/api/tracks', (_req, res) => {
  const list = readdirSync(builtDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(builtDir, f), 'utf8')))
    .map((t) => ({
      id: t.id, title: t.title, subtitle: t.subtitle, icon: t.icon, color: t.color,
      custom: !!t.custom, generating: !!t.generating,
      chapters: t.chapters.map((c) => ({ id: c.id, lessons: c.lessons.map((l) => l.id) })),
    }));
  res.json(list);
});

app.get('/api/tracks/:id', (req, res) => {
  const t = readTrack(req.params.id);
  t ? res.json(t) : res.status(404).json({ error: 'trilha não encontrada' });
});

// ----- Criação de trilhas por fora (agente do Hub) -----
// Registra recusas da API de criação (ajuda a ver o que o agente tentou enviar).
const refuse = (what, req, res, e) => {
  console.error(`[trilhas] ${what} recusado: ${e.message} | corpo: ${JSON.stringify(req.body).slice(0, 400)}`);
  res.status(e.status || 500).json({ error: String(e.message || e) });
};
app.post('/api/tracks', (req, res) => {
  try { res.status(201).json(createTrack(builtDir, req.body)); } catch (e) { refuse('create', req, res, e); }
});
app.post('/api/tracks/:id/lessons', (req, res) => {
  try { res.status(201).json(addLessons(builtDir, req.params.id, req.body || {})); } catch (e) { refuse('add_lessons', req, res, e); }
});
app.delete('/api/tracks/:id', (req, res) => {
  try { res.json(deleteTrack(builtDir, req.params.id)); } catch (e) { res.status(e.status || 500).json({ error: String(e.message || e) }); }
});

app.get('/api/progress', (_req, res) => {
  res.json(existsSync(progressFile) ? JSON.parse(readFileSync(progressFile, 'utf8')) : null);
});

app.put('/api/progress', (req, res) => {
  const tmp = progressFile + '.tmp';
  writeFileSync(tmp, JSON.stringify(req.body));
  renameSync(tmp, progressFile);
  res.json({ ok: true });
});

app.get('/api/ai/status', async (_req, res) => res.json({ claude: await claudeAvailable() }));

app.post('/api/ai/generate', (req, res) => {
  const { topic, level = 'iniciante', chapters = 4 } = req.body || {};
  if (!topic || String(topic).length > 120) return res.status(400).json({ error: 'tópico inválido' });
  res.json({ jobId: startGeneration({ topic: String(topic), level, chapters: Math.min(8, Math.max(2, +chapters || 4)), builtDir }) });
});

app.get('/api/ai/jobs/:id', (req, res) => {
  const j = getJob(req.params.id);
  j ? res.json(j) : res.status(404).json({ error: 'job não encontrado' });
});

app.post('/api/ai/hint', async (req, res) => {
  try {
    res.json({ hint: await aiHint(req.body || {}) });
  } catch (e) {
    res.status(503).json({ error: String(e.message || e) });
  }
});

// ----- Mentor (chat com IA) -----
app.get('/api/mentor/history', (_req, res) => res.json(getHistory()));
app.delete('/api/mentor/history', (_req, res) => { clearHistory(); res.json({ ok: true }); });
app.post('/api/mentor/chat', async (req, res) => {
  try {
    res.json(await chat({ message: req.body?.message, context: req.body?.context }));
  } catch (e) {
    res.status(503).json({ error: String(e.message || e) });
  }
});

// ----- Notas -----
app.get('/api/notes', (_req, res) => res.json({ notes: listNotes(), hub: hubAvailable() }));
app.post('/api/notes', async (req, res) => {
  const { title, body, tags, source } = req.body || {};
  if (!String(title || body || '').trim()) return res.status(400).json({ error: 'nota vazia' });
  res.status(201).json(await createNote({ title, body, tags }, source || null));
});
app.put('/api/notes/:id', async (req, res) => {
  const n = await updateNote(req.params.id, req.body || {});
  n ? res.json(n) : res.status(404).json({ error: 'nota não encontrada' });
});
app.delete('/api/notes/:id', async (req, res) => {
  (await deleteNote(req.params.id)) ? res.json({ ok: true }) : res.status(404).json({ error: 'nota não encontrada' });
});
app.post('/api/notes/sync', async (_req, res) => res.json({ notes: await syncPending(), hub: hubAvailable() }));

const dist = join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

const port = process.env.PORT || 4300;
app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Trilhas em http://127.0.0.1:${port}`));
