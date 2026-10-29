import fs from "node:fs";
import path from "node:path";
import { db, parse } from "./db.js";
import { VAULT_DIR } from "./paths.js";
import { ftsQuery } from "./roadmap.js";
import { computeTree, computeGaps } from "./progress.js";

const slug = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "x";

/** Busca unificada: trechos (FTS5), conceitos e nós. É o que o chat e agentes externos usam. */
export function search(subjectId, q, { limit = 12 } = {}) {
  const fts = ftsQuery(q, 12);
  let chunks = [];
  if (fts) {
    try {
      chunks = db()
        .prepare(
          `SELECT c.id, c.locator, c.heading, s.title AS source, s.id AS source_id,
                  snippet(chunks_fts, 0, '«', '»', ' … ', 24) AS snippet, c.text
           FROM chunks_fts f JOIN chunks c ON c.id=f.rowid JOIN sources s ON s.id=c.source_id
           WHERE chunks_fts MATCH ? AND c.subject_id=? ORDER BY rank LIMIT ?`
        )
        .all(fts, subjectId, limit);
    } catch {}
  }
  const like = `%${String(q).trim().slice(0, 80)}%`;
  const concepts = db()
    .prepare("SELECT id, title, definition, importance FROM concepts WHERE subject_id=? AND (title LIKE ? OR definition LIKE ?) ORDER BY importance DESC LIMIT 8")
    .all(subjectId, like, like);
  const nodes = db().prepare("SELECT id, title, branch, tier, summary FROM nodes WHERE subject_id=? AND (title LIKE ? OR summary LIKE ?) LIMIT 8").all(subjectId, like, like);
  return { chunks, concepts, nodes };
}

export function exportVault(subjectId) {
  const subject = db().prepare("SELECT * FROM subjects WHERE id=?").get(subjectId);
  const root = path.join(VAULT_DIR, `${slug(subject.title)}-${subjectId.slice(-4)}`);
  fs.rmSync(root, { recursive: true, force: true });
  for (const d of ["sources", "concepts", "nodes"]) fs.mkdirSync(path.join(root, d), { recursive: true });
  const w = (rel, text) => fs.writeFileSync(path.join(root, rel), text);

  const sources = db().prepare("SELECT * FROM sources WHERE subject_id=?").all(subjectId);
  for (const s of sources) {
    const outline = parse(s.outline_json, []).map((o) => `- **${o.title}** (${o.locator || ""}) — ${o.summary || ""}`).join("\n");
    w(`sources/${slug(s.title)}-${s.id.slice(-4)}.md`, `---\nid: ${s.id}\nkind: ${s.kind}\nstatus: ${s.status}\n---\n# ${s.title}\n\n${s.summary || ""}\n\n## Metodologia\n${s.methodology || ""}\n\n## Estrutura\n${outline}\n`);
  }
  const concepts = db().prepare("SELECT * FROM concepts WHERE subject_id=? ORDER BY importance DESC, title").all(subjectId);
  const chunkRefs = db().prepare("SELECT c.id, c.locator, s.title FROM concept_chunks cc JOIN chunks c ON c.id=cc.chunk_id JOIN sources s ON s.id=c.source_id WHERE cc.concept_id=?");
  for (const c of concepts) {
    const refs = chunkRefs.all(c.id).map((r) => `${r.title} ${r.locator} (chunk ${r.id})`).join("; ");
    w(`concepts/${slug(c.title)}-${c.id}.md`, `---\nid: c${c.id}\nimportance: ${c.importance}\n---\n# ${c.title}\n\n**Definição:** ${c.definition || ""}\n\n**Metodologia:** ${c.methodology || ""}\n\n**Critérios:** ${c.criteria || ""}\n\n**Referências:** ${c.refs || ""}\n\n**Evidência:** ${refs}\n`);
  }
  const { nodes } = computeTree(subjectId);
  const title = new Map(nodes.map((n) => [n.id, n.title]));
  for (const n of nodes) {
    const cs = db().prepare("SELECT c.id, c.title FROM node_concepts nc JOIN concepts c ON c.id=nc.concept_id WHERE nc.node_id=?").all(n.id);
    w(
      `nodes/${slug(n.title)}-${n.id.slice(-4)}.md`,
      `---\nid: ${n.id}\nbranch: ${n.branch}\ntier: ${n.tier}\nkind: ${n.kind}\nstatus: ${n.status}\nmastery: ${n.mastery}\n---\n# ${n.title}\n\n${n.summary || ""}\n\n## Objetivos\n${n.objectives.map((o) => `- ${o}`).join("\n")}\n\n## Pré-requisitos\n${n.prereqs.map((p) => `- (${p.kind}) ${title.get(p.id)}`).join("\n") || "- (nenhum)"}\n\n## Conceitos\n${cs.map((c) => `- c${c.id} ${c.title}`).join("\n")}\n`
    );
  }
  const gaps = computeGaps(subjectId);
  w(
    "progress.md",
    `# Progresso — ${subject.title}\n\n## Nós\n${nodes.map((n) => `- [${n.status}] ${n.title} (${Math.round(n.mastery * 100)}%)`).join("\n")}\n\n## Pontos de atenção\n${gaps.weakConcepts.map((c) => `- Conceito fraco: ${c.title} (${Math.round((c.recent_score ?? c.avg_score) * 100)}%)`).join("\n")}\n${gaps.misconceptions.map((m) => `- Equívoco recorrente (${m.times}x): ${m.misconception}`).join("\n")}\n`
  );
  w(
    "README.md",
    `# ${subject.title}\n\nObjetivo: ${subject.goal || ""}\n\nEstrutura desta vault (gerada do banco SQLite \`data/atlas.db\`; veja docs/SCHEMA.md):\n- sources/ — fontes com resumo, metodologia e estrutura\n- concepts/ — conceitos com definição, método, critérios, referências, evidências\n- nodes/ — árvore de habilidades (pré-requisitos, objetivos, conceitos)\n- progress.md — domínio e pontos de atenção\n`
  );
  return root;
}
