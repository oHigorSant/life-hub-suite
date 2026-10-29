#!/usr/bin/env node
// CLI da base de conhecimento do Atlas — para pessoas e agentes. Somente leitura (exceto `export`).
// Uso: npm run kb -- <comando> [args]
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

const DATA = process.env.ATLAS_DATA_DIR || path.join(process.cwd(), "data", "estudos");
const db = new DatabaseSync(path.join(DATA, "atlas.db"), { readOnly: true });
const [cmd, ...args] = process.argv.slice(2);
const out = (v) => console.log(typeof v === "string" ? v : JSON.stringify(v, null, 2));
const ftsQ = (t) => [...new Set(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 3))].slice(0, 12).map((w) => `"${w}"`).join(" OR ");

const HELP = `Atlas KB
  schema                       tabelas, colunas e o que cada uma significa (schema_docs)
  subjects                     áreas e contagens
  tree <subject>               nós com tier/ramo/pré-requisitos
  node <nodeId>                nó + conceitos + trechos-fonte + questões
  concept <id|texto>           conceito(s) com definição, método, critérios, referências, evidências
  search <subject> <texto>     busca full-text nos trechos (com fonte e localizador)
  gaps <subject>               conceitos fracos, equívocos recorrentes, excesso de confiança
  sql "<SELECT ...>"           consulta somente-leitura livre (veja as views v_*)
`;

switch (cmd) {
  case "schema": {
    const rows = db.prepare("SELECT object, column_name, description FROM schema_docs ORDER BY object, column_name").all();
    let cur = "";
    for (const r of rows) {
      if (r.object !== cur) { console.log(`\n## ${r.object}`); cur = r.object; }
      console.log(r.column_name ? `  - ${r.column_name}: ${r.description}` : `  ${r.description}`);
    }
    break;
  }
  case "subjects":
    out(db.prepare(`SELECT s.id, s.title, s.goal, (SELECT COUNT(*) FROM sources WHERE subject_id=s.id) sources,
      (SELECT COUNT(*) FROM concepts WHERE subject_id=s.id) concepts, (SELECT COUNT(*) FROM nodes WHERE subject_id=s.id) nodes FROM subjects s`).all());
    break;
  case "tree":
    out(db.prepare(`SELECT n.id, n.tier, n.branch, n.kind, n.title,
      (SELECT group_concat(e.kind || ':' || p.title, ' | ') FROM node_edges e JOIN nodes p ON p.id=e.from_node WHERE e.to_node=n.id) AS prereqs
      FROM nodes n WHERE n.subject_id=? ORDER BY n.tier, n.sort`).all(args[0]));
    break;
  case "node": {
    const n = db.prepare("SELECT * FROM nodes WHERE id=?").get(args[0]);
    out({
      node: n,
      concepts: db.prepare("SELECT c.id, c.title, c.definition, c.methodology, c.criteria, c.refs FROM node_concepts nc JOIN concepts c ON c.id=nc.concept_id WHERE nc.node_id=?").all(args[0]),
      chunks: db.prepare("SELECT c.id, s.title source, c.locator, substr(c.text,1,300) preview FROM node_chunks nc JOIN chunks c ON c.id=nc.chunk_id JOIN sources s ON s.id=c.source_id WHERE nc.node_id=?").all(args[0]),
      questions: db.prepare("SELECT id, type, bloom, difficulty, prompt FROM questions WHERE node_id=?").all(args[0]),
    });
    break;
  }
  case "concept": {
    const q = args.join(" ");
    const rows = /^\d+$/.test(q) ? db.prepare("SELECT * FROM concepts WHERE id=?").all(Number(q)) : db.prepare("SELECT * FROM concepts WHERE title LIKE ? LIMIT 10").all(`%${q}%`);
    out(rows.map((c) => ({ ...c, evidence: db.prepare("SELECT ch.id chunk, s.title source, ch.locator FROM concept_chunks cc JOIN chunks ch ON ch.id=cc.chunk_id JOIN sources s ON s.id=ch.source_id WHERE cc.concept_id=?").all(c.id) })));
    break;
  }
  case "search": {
    const [sid, ...t] = args;
    out(db.prepare(`SELECT c.id, s.title source, c.locator, c.heading, snippet(chunks_fts,0,'«','»',' … ',30) snippet
      FROM chunks_fts f JOIN chunks c ON c.id=f.rowid JOIN sources s ON s.id=c.source_id
      WHERE chunks_fts MATCH ? AND c.subject_id=? ORDER BY rank LIMIT 15`).all(ftsQ(t.join(" ")), sid));
    break;
  }
  case "gaps":
    out({
      weak_concepts: db.prepare("SELECT * FROM v_concept_mastery WHERE subject_id=? AND attempts>=2 AND COALESCE(recent_score,avg_score)<0.65 ORDER BY importance DESC").all(args[0]),
      misconceptions: db.prepare("SELECT * FROM v_misconceptions WHERE subject_id=? ORDER BY times DESC").all(args[0]),
    });
    break;
  case "sql": {
    const q = args.join(" ").trim();
    if (!/^(select|with|pragma table_info)/i.test(q)) { console.error("Somente SELECT."); process.exit(1); }
    out(db.prepare(q).all());
    break;
  }
  default:
    console.log(HELP);
}
