import { DatabaseSync } from "node:sqlite";
import { DB_FILE } from "./paths.js";

// Um único handle por processo (o Next recarrega módulos em dev, então pendura no globalThis).
const g = globalThis;

const SCHEMA = `
PRAGMA busy_timeout = 8000;
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal TEXT,
  start_level TEXT,
  target_level TEXT,
  deadline TEXT,
  hours_per_week REAL,
  status TEXT NOT NULL DEFAULT 'active',
  color TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT,
  path TEXT,
  url TEXT,
  mime TEXT,
  bytes INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  pages INTEGER,
  duration_sec REAL,
  summary TEXT,
  outline_json TEXT,
  methodology TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_subject ON sources(subject_id);

CREATE TABLE IF NOT EXISTS chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  locator TEXT,
  heading TEXT,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id, ord);
CREATE INDEX IF NOT EXISTS idx_chunks_subject ON chunks(subject_id);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  text, heading, content='chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, text, heading) VALUES (new.id, new.text, new.heading);
END;
CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, text, heading) VALUES ('delete', old.id, old.text, old.heading);
END;

CREATE TABLE IF NOT EXISTS concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  source_id TEXT,
  title TEXT NOT NULL,
  norm TEXT NOT NULL,
  definition TEXT,
  methodology TEXT,
  criteria TEXT,
  refs TEXT,
  importance INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL,
  UNIQUE(subject_id, norm)
);
CREATE TABLE IF NOT EXISTS concept_chunks (
  concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  PRIMARY KEY (concept_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  branch TEXT NOT NULL DEFAULT 'Geral',
  tier INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'skill',
  est_minutes INTEGER NOT NULL DEFAULT 45,
  objectives_json TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE(subject_id, key)
);
CREATE INDEX IF NOT EXISTS idx_nodes_subject ON nodes(subject_id);

CREATE TABLE IF NOT EXISTS node_edges (
  from_node TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'hard',
  PRIMARY KEY (from_node, to_node)
);
CREATE TABLE IF NOT EXISTS node_concepts (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  concept_id INTEGER NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, concept_id)
);
CREATE TABLE IF NOT EXISTS node_chunks (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  node_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_node ON activities(node_id, type);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  node_id TEXT,
  concept_id INTEGER,
  activity_id TEXT,
  type TEXT NOT NULL,
  bloom TEXT,
  difficulty INTEGER NOT NULL DEFAULT 3,
  prompt TEXT NOT NULL,
  options_json TEXT,
  answer_json TEXT NOT NULL,
  explanation TEXT,
  rubric TEXT,
  chunk_ids_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_node ON questions(node_id);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT NOT NULL,
  node_id TEXT,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  concept_id INTEGER,
  score REAL NOT NULL,
  answer_json TEXT,
  misconception TEXT,
  confidence INTEGER,
  time_ms INTEGER,
  feedback TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_node ON attempts(node_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attempts_concept ON attempts(concept_id, created_at);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  node_id TEXT,
  concept_id INTEGER,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(subject_id, due);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  grade INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS node_state (
  node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  started INTEGER NOT NULL DEFAULT 0,
  lesson_done INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_id TEXT,
  ref_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  message TEXT,
  result_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id TEXT,
  kind TEXT NOT NULL,
  ref TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_subject ON events(subject_id, created_at);

CREATE TABLE IF NOT EXISTS node_scope (
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  lo_ord INTEGER NOT NULL,
  hi_ord INTEGER NOT NULL,
  PRIMARY KEY (node_id, source_id)
);

CREATE TABLE IF NOT EXISTS ai_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT,
  ms INTEGER,
  ok INTEGER NOT NULL,
  error TEXT,
  chars_in INTEGER,
  chars_out INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_docs (
  object TEXT NOT NULL,
  column_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL,
  PRIMARY KEY (object, column_name)
);

-- Visões analíticas: o que um agente deve consultar primeiro.
DROP VIEW IF EXISTS v_concept_mastery;
CREATE VIEW v_concept_mastery AS
SELECT c.id AS concept_id, c.subject_id, c.title, c.importance,
       COUNT(a.id) AS attempts,
       ROUND(AVG(a.score), 3) AS avg_score,
       ROUND(AVG(CASE WHEN a.created_at > (strftime('%s','now')-14*86400)*1000 THEN a.score END), 3) AS recent_score,
       MAX(a.created_at) AS last_attempt
FROM concepts c LEFT JOIN attempts a ON a.concept_id = c.id
GROUP BY c.id;

DROP VIEW IF EXISTS v_misconceptions;
CREATE VIEW v_misconceptions AS
SELECT a.subject_id, a.node_id, a.concept_id, a.misconception, COUNT(*) AS times, MAX(a.created_at) AS last_seen
FROM attempts a
WHERE a.misconception IS NOT NULL AND a.misconception <> '' AND a.score < 0.6
GROUP BY a.subject_id, a.node_id, a.concept_id, a.misconception;

DROP VIEW IF EXISTS v_card_due;
CREATE VIEW v_card_due AS
SELECT * FROM cards WHERE due <= (strftime('%s','now') * 1000);
`;

const DOCS = [
  ["subjects", "", "Área de conhecimento (uma trilha completa, do iniciante ao ápice). Raiz de todo o resto."],
  ["subjects", "goal", "O que o aluno quer dominar, em linguagem livre."],
  ["subjects", "start_level", "Nível de partida declarado (iniciante, intermediário...)."],
  ["subjects", "target_level", "Nível alvo (ex.: 'domínio profissional', 'ápice')."],
  ["subjects", "deadline", "Data-alvo opcional (YYYY-MM-DD). Define o ritmo diário."],
  ["subjects", "hours_per_week", "Horas semanais disponíveis para estudo."],
  ["sources", "", "Material anexado (texto, pdf, imagem, áudio, vídeo, url). Cada fonte vira chunks e conceitos."],
  ["sources", "kind", "text | pdf | image | audio | video | url"],
  ["sources", "status", "queued | extracting | analyzing | ready | error"],
  ["sources", "summary", "Resumo da fonte inteira (gerado na etapa reduce)."],
  ["sources", "outline_json", "Estrutura da fonte: [{title, summary, locator}] — o 'índice inteligente'."],
  ["sources", "methodology", "Metodologia/abordagem/critério didático que o autor da fonte segue."],
  ["chunks", "", "Trechos da fonte com localizador. É a evidência de tudo: citações e geração se ancoram aqui. Busca via chunks_fts (FTS5)."],
  ["chunks", "locator", "Onde o trecho está: 'p.12-14' (pdf), '00:12:30-00:14:10' (áudio/vídeo), 'seção 3'."],
  ["chunks_fts", "", "Índice de busca full-text de chunks. Ex.: SELECT rowid FROM chunks_fts WHERE chunks_fts MATCH 'termo'."],
  ["concepts", "", "Átomo de conhecimento extraído das fontes: definição, metodologia, critérios, referências."],
  ["concepts", "methodology", "Como o conceito é aplicado/ensinado na fonte (passos, abordagem)."],
  ["concepts", "criteria", "Critérios para saber se está correto/dominado (o que separa bom de ruim)."],
  ["concepts", "refs", "Referências citadas para esse conceito (autores, obras, normas)."],
  ["concepts", "importance", "1-5; quanto maior, mais central ao domínio da área."],
  ["concept_chunks", "", "Evidência: em quais chunks cada conceito aparece."],
  ["nodes", "", "Nó da árvore de habilidades. Não-linear: a ordem vem de node_edges, não de 'sort'."],
  ["nodes", "branch", "Ramo/guarda-chuva temático (nós do mesmo ramo sem aresta entre si podem ser feitos em qualquer ordem)."],
  ["nodes", "tier", "Profundidade 0 (fundamentos) → N (ápice). Só para layout/nível; o bloqueio vem das arestas."],
  ["nodes", "kind", "skill | capstone (projeto/simulado final de ramo) | keystone (nó central que destrava muitos)"],
  ["nodes", "objectives_json", "Lista de objetivos de aprendizagem verificáveis (verbos de Bloom)."],
  ["node_edges", "", "Pré-requisitos. hard = precisa dominar antes de liberar; soft = recomendado, não bloqueia."],
  ["node_concepts", "", "Quais conceitos cada nó ensina."],
  ["node_chunks", "", "Trechos-fonte onde o nó é ENSINADO (primeira ocorrência dos seus conceitos no material, não as menções posteriores)."],
  ["node_scope", "", "Janela do material (ordem de trechos) que corresponde ao nó, por fonte. Define o que o aluno já pode ter visto: nó + ancestrais."],
  ["ai_calls", "", "Registro de chamadas ao motor de inteligência (Claude): rótulo, duração, sucesso."],
  ["activities", "", "Conteúdo gerado por nó: lesson, reading, exercise, quiz, flashcards, podcast, mock, project."],
  ["questions", "", "Banco de questões, cada uma ligada a nó, conceito e trechos-fonte."],
  ["questions", "bloom", "remember | understand | apply | analyze | evaluate | create"],
  ["questions", "difficulty", "1-5. Questões 4-5 exigem transferência/raciocínio em cenário novo."],
  ["questions", "answer_json", "Resposta correta (formato depende de type)."],
  ["questions", "options_json", "Alternativas; cada distrator carrega a 'misconception' que ele representa."],
  ["attempts", "", "Cada resposta do aluno. Base do mastery e da detecção de falhas."],
  ["attempts", "score", "0..1 (parcial permitido em respostas abertas)."],
  ["attempts", "misconception", "Equívoco específico revelado pela resposta errada (agregado em v_misconceptions)."],
  ["attempts", "confidence", "1-3 declarado antes de ver o resultado; permite achar excesso de confiança."],
  ["cards", "", "Flashcards com repetição espaçada (SM-2). due = epoch ms da próxima revisão."],
  ["node_state", "", "Estado de estudo por nó (iniciado, lição lida, xp)."],
  ["jobs", "", "Tarefas longas em background (ingestão, geração de trilha) com progresso."],
  ["events", "", "Diário de progresso append-only (o que aconteceu e quando)."],
  ["v_concept_mastery", "", "Domínio por conceito: tentativas, média e média recente."],
  ["v_misconceptions", "", "Equívocos recorrentes por nó/conceito — pontos de atenção."],
  ["v_card_due", "", "Cartões vencidos agora."],
];

function open() {
  const db = new DatabaseSync(DB_FILE);
  db.exec(SCHEMA);
  const ins = db.prepare("INSERT OR REPLACE INTO schema_docs(object, column_name, description) VALUES (?,?,?)");
  for (const [o, c, d] of DOCS) ins.run(o, c, d);
  return db;
}

export function db() {
  if (!g.__atlasDb) g.__atlasDb = open();
  return g.__atlasDb;
}

export const now = () => Date.now();
export const uid = (p = "") => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
export const j = (v) => (v == null ? null : JSON.stringify(v));
export const parse = (s, d = null) => {
  try {
    return s ? JSON.parse(s) : d;
  } catch {
    return d;
  }
};

export function tx(fn) {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn(d);
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function logEvent(subjectId, kind, ref = null, payload = null) {
  db()
    .prepare("INSERT INTO events(subject_id, kind, ref, payload_json, created_at) VALUES (?,?,?,?,?)")
    .run(subjectId, kind, ref, j(payload), now());
}
