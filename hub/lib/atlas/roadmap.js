import { db, now, uid, j, parse, tx, logEvent } from "./db.js";
import { askJson } from "./llm.js";
import { runJob } from "./jobs.js";
import { assignScopes, conceptPositions } from "./scope.js";
import { ROADMAP_STANDARD } from "../contentStandard.js";

const norm = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const SYSTEM = `Você é um arquiteto de currículos de nível mundial. Constrói ÁRVORES DE HABILIDADES (não listas lineares) para dominar uma área do conhecimento, do iniciante ao ápice.

Princípios:
- Estrutura em grafo: arestas "hard" (pré-requisito real: sem isso não dá pra aprender) e "soft" (recomendado). Itens do mesmo guarda-chuva que NÃO dependem um do outro NÃO devem ter aresta entre si — o aluno escolhe a ordem. Nada de cadeia linear artificial.
- Ramos (branch) = grandes frentes temáticas da área. Tier 0 = fundamentos, subindo até o ápice (maestria, casos difíceis, síntese, criação).
- Cada nó = uma habilidade ensinável em ~30-90 min, com objetivos verificáveis (verbos de Bloom: aplicar, analisar, avaliar, criar — evite "entender" vago).
- 'kind': "skill" (padrão), "keystone" (nó que destrava muita coisa) ou "capstone" (projeto/desafio integrador de um ramo ou do ápice).
- Se há material anexado, a árvore deve refletir a METODOLOGIA, os CRITÉRIOS e as REFERÊNCIAS dele (a ordem e a ênfase do autor), cobrindo-o por inteiro e sem inventar o que ele não tem; complete lacunas só quando necessário para o objetivo.
- Calibre o tamanho ao tempo disponível e ao nível alvo; o ápice deve exigir domínio real, não superficial.
${ROADMAP_STANDARD}
- PROGRESSÃO DO MATERIAL = GRADUAÇÃO DA TRILHA. Cada conceito traz "@N%": a posição do material em que ele é introduzido pela primeira vez. O autor ordena do mais simples ao mais avançado, então conceitos com @ maior pertencem a nós mais profundos. Regras: (1) um nó concentra conceitos de UMA região contígua do material (diferença de no máximo ~12 pontos percentuais entre eles); (2) nunca coloque num nó inicial um conceito que o material só introduz mais adiante; (3) os pré-requisitos "hard" seguem a ordem em que o material ensina (o nó que o livro ensina depois depende do que ele ensinou antes, nunca o contrário); (4) ao definir tiers, mantenha a ordem do livro como espinha dorsal e use ramos paralelos só para o que o livro trata como independente.`;

function gatherContext(subjectId) {
  const sources = db().prepare("SELECT id, title, kind, summary, methodology, outline_json FROM sources WHERE subject_id=? AND status='ready'").all(subjectId);
  const pos = conceptPositions(subjectId);
  const concepts = db()
    .prepare("SELECT id, title, importance FROM concepts WHERE subject_id=? ORDER BY importance DESC, id LIMIT 700")
    .all(subjectId)
    .map((c) => ({ ...c, pos: pos.get(c.id) ?? null }))
    .sort((a, b) => (a.pos ?? 999) - (b.pos ?? 999) || a.id - b.id); // na ordem em que o material ensina
  const nodes = db().prepare("SELECT key, title, branch, tier FROM nodes WHERE subject_id=?").all(subjectId);
  return { sources, concepts, nodes };
}

function budgetText(subject) {
  const parts = [];
  if (subject.hours_per_week) parts.push(`${subject.hours_per_week} h/semana`);
  if (subject.deadline) {
    const weeks = Math.max(1, Math.round((new Date(subject.deadline) - Date.now()) / (7 * 864e5)));
    parts.push(`prazo ${subject.deadline} (~${weeks} semanas)`);
    if (subject.hours_per_week) parts.push(`orçamento total ≈ ${Math.round(weeks * subject.hours_per_week)} h`);
  }
  return parts.join("; ") || "sem restrição de tempo declarada";
}

function renderContext(ctx) {
  let s = "";
  if (ctx.sources.length) {
    s += "FONTES ANEXADAS:\n";
    for (const src of ctx.sources) {
      const outline = parse(src.outline_json, []).map((o) => `  - ${o.title}${o.locator ? ` (${o.locator})` : ""}: ${o.summary || ""}`).join("\n");
      s += `• ${src.title} [${src.kind}]\n  Resumo: ${src.summary || ""}\n  Metodologia: ${src.methodology || ""}\n${outline}\n`;
    }
    s += "\nCONCEITOS EXTRAÍDOS, NA ORDEM EM QUE O MATERIAL OS ENSINA (id: título [importância] @posição):\n" + ctx.concepts.map((c) => `c${c.id}: ${c.title} [${c.importance}]${c.pos != null ? ` @${c.pos}%` : ""}`).join("\n") + "\n";
  }
  if (ctx.nodes.length) {
    s += "\nNÓS JÁ EXISTENTES (não repita; pode usar as keys como pré-requisito):\n" + ctx.nodes.map((n) => `${n.key} | ${n.title} | ${n.branch} | tier ${n.tier}`).join("\n") + "\n";
  }
  return s;
}

const OUTPUT_SPEC = `JSON:
{"nodes":[{
  "key":"slug-unico","title":"","summary":"1-2 frases","branch":"nome do ramo","kind":"skill|keystone|capstone",
  "est_minutes":45,"objectives":["verbo + resultado verificável"],
  "concepts":[{"id":12}|{"title":"conceito novo","definition":"..."}],
  "hard":["key de pré-requisito real"],"soft":["key recomendada"]
}]}
Use "concepts" com {"id":N} (o número do 'cN' acima) sempre que o conceito já existir; crie {"title","definition"} só para lacunas.`;

function persistNodes(subjectId, nodes) {
  const existing = new Map(db().prepare("SELECT key, id FROM nodes WHERE subject_id=?").all(subjectId).map((r) => [r.key, r.id]));
  const slug = (s) => norm(s).replace(/\s+/g, "-").slice(0, 48) || "no";
  const fresh = [];
  const keyMap = new Map();
  for (const n of nodes) {
    if (!n?.title) continue;
    let key = slug(n.key || n.title);
    while (existing.has(key) || keyMap.has(key)) key += "-2";
    keyMap.set(n.key || key, key);
    keyMap.set(key, key);
    fresh.push({ ...n, _key: key });
  }
  // Valida arestas (só para chaves conhecidas) e quebra ciclos hard.
  const allKeys = new Set([...existing.keys(), ...fresh.map((n) => n._key)]);
  const resolve = (k) => keyMap.get(k) ?? (existing.has(k) ? k : null);
  const hard = new Map(); // key -> Set(keys)
  const soft = new Map();
  for (const n of fresh) {
    hard.set(n._key, new Set((n.hard || []).map(resolve).filter((k) => k && k !== n._key && allKeys.has(k))));
    soft.set(n._key, new Set((n.soft || []).map(resolve).filter((k) => k && k !== n._key && allKeys.has(k) && !hard.get(n._key).has(k))));
  }
  const existingHard = new Map();
  for (const r of db().prepare("SELECT a.key AS f, b.key AS t FROM node_edges e JOIN nodes a ON a.id=e.from_node JOIN nodes b ON b.id=e.to_node WHERE a.subject_id=? AND e.kind='hard'").all(subjectId)) {
    if (!existingHard.has(r.t)) existingHard.set(r.t, new Set());
    existingHard.get(r.t).add(r.f);
  }
  const deps = (k) => hard.get(k) ?? existingHard.get(k) ?? new Set();
  // remove ciclos: DFS; aresta que volta para a pilha é descartada
  const state = new Map();
  const visit = (k) => {
    state.set(k, 1);
    for (const d of [...deps(k)]) {
      if (state.get(d) === 1) hard.get(k)?.delete(d);
      else if (!state.get(d)) visit(d);
    }
    state.set(k, 2);
  };
  for (const k of allKeys) if (!state.get(k)) visit(k);

  const insNode = db().prepare(
    "INSERT INTO nodes(id, subject_id, key, title, summary, branch, tier, kind, est_minutes, objectives_json, sort, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
  );
  const insEdge = db().prepare("INSERT OR IGNORE INTO node_edges(from_node, to_node, kind) VALUES (?,?,?)");
  const insNC = db().prepare("INSERT OR IGNORE INTO node_concepts(node_id, concept_id) VALUES (?,?)");
  const upConcept = db().prepare(
    "INSERT INTO concepts(subject_id, title, norm, definition, importance, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(subject_id, norm) DO UPDATE SET definition=COALESCE(NULLIF(concepts.definition,''), excluded.definition)"
  );
  const getConcept = db().prepare("SELECT id FROM concepts WHERE subject_id=? AND norm=?");
  const hasConcept = db().prepare("SELECT id FROM concepts WHERE id=? AND subject_id=?");
  const idOf = new Map(existing);
  let sort = db().prepare("SELECT COALESCE(MAX(sort),0) AS m FROM nodes WHERE subject_id=?").get(subjectId).m;

  tx(() => {
    for (const n of fresh) {
      const id = uid("n_");
      idOf.set(n._key, id);
      insNode.run(id, subjectId, n._key, String(n.title).slice(0, 140), n.summary || "", String(n.branch || "Geral").slice(0, 60), 0, ["keystone", "capstone"].includes(n.kind) ? n.kind : "skill", Math.min(240, Math.max(10, Number(n.est_minutes) || 45)), j(n.objectives || []), ++sort, now());
    }
    for (const n of fresh) {
      const id = idOf.get(n._key);
      for (const d of hard.get(n._key)) if (idOf.get(d)) insEdge.run(idOf.get(d), id, "hard");
      for (const d of soft.get(n._key)) if (idOf.get(d)) insEdge.run(idOf.get(d), id, "soft");
      for (const c of n.concepts || []) {
        let cid = null;
        if (c.id != null && hasConcept.get(Number(String(c.id).replace(/^c/, "")), subjectId)) cid = Number(String(c.id).replace(/^c/, ""));
        else if (c.title) {
          upConcept.run(subjectId, String(c.title), norm(c.title), c.definition || "", 3, now());
          cid = getConcept.get(subjectId, norm(c.title))?.id;
        }
        if (cid) insNC.run(id, cid);
      }
    }
    // Recalcula tier de todos os nós (um novo pré-requisito pode empurrar existentes).
    recomputeTiers(subjectId);
  });
  return fresh.length;
}

export function recomputeTiers(subjectId) {
  const nodes = db().prepare("SELECT id FROM nodes WHERE subject_id=?").all(subjectId);
  const hardIn = new Map();
  for (const e of db().prepare("SELECT e.from_node f, e.to_node t FROM node_edges e JOIN nodes n ON n.id=e.to_node WHERE n.subject_id=? AND e.kind='hard'").all(subjectId)) {
    if (!hardIn.has(e.t)) hardIn.set(e.t, []);
    hardIn.get(e.t).push(e.f);
  }
  const memo = new Map();
  const t = (id, stack = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const v = (hardIn.get(id) || []).length ? 1 + Math.max(...hardIn.get(id).map((d) => t(d, stack))) : 0;
    stack.delete(id);
    memo.set(id, v);
    return v;
  };
  const up = db().prepare("UPDATE nodes SET tier=? WHERE id=?");
  for (const n of nodes) up.run(t(n.id), n.id);
}

/** Liga trechos-fonte a cada nó: via conceitos do nó e, se faltar, via busca full-text. */
export function assignChunks(subjectId) {
  const nodes = db().prepare("SELECT id, title, objectives_json FROM nodes WHERE subject_id=?").all(subjectId);
  const byConcept = db().prepare(
    `SELECT cc.chunk_id, COUNT(*) AS w FROM node_concepts nc JOIN concept_chunks cc ON cc.concept_id=nc.concept_id
     WHERE nc.node_id=? GROUP BY cc.chunk_id ORDER BY w DESC, cc.chunk_id LIMIT 14`
  );
  const ins = db().prepare("INSERT OR IGNORE INTO node_chunks(node_id, chunk_id) VALUES (?,?)");
  const has = db().prepare("SELECT COUNT(*) AS n FROM node_chunks WHERE node_id=?");
  for (const n of nodes) {
    if (has.get(n.id).n) continue;
    const ids = byConcept.all(n.id).map((r) => r.chunk_id);
    if (ids.length < 4) {
      const q = ftsQuery(n.title + " " + (parse(n.objectives_json, []) || []).join(" "));
      if (q) {
        try {
          const extra = db().prepare("SELECT c.id FROM chunks_fts f JOIN chunks c ON c.id=f.rowid WHERE chunks_fts MATCH ? AND c.subject_id=? ORDER BY rank LIMIT 6").all(q, subjectId);
          ids.push(...extra.map((r) => r.id));
        } catch {}
      }
    }
    for (const id of new Set(ids)) ins.run(n.id, id);
  }
}

export function ftsQuery(text, max = 10) {
  const words = [...new Set(norm(text).split(" ").filter((w) => w.length > 3))].slice(0, max);
  return words.length ? words.map((w) => `"${w}"`).join(" OR ") : "";
}

/** Gera (ou complementa) a árvore da área. `prompt` opcional vem do chat ("quero 20h de trilha sobre X"). */
export function generateRoadmap(subjectId, { extend = false, prompt = "" } = {}) {
  return runJob("roadmap", subjectId, null, async (report) => {
    const subject = db().prepare("SELECT * FROM subjects WHERE id=?").get(subjectId);
    const ctx = gatherContext(subjectId);
    report(0.1, "Desenhando a árvore de habilidades…");
    const task = extend
      ? `COMPLEMENTE a árvore existente com novos nós (3 a 30) conforme o pedido, conectando-os aos nós existentes.\nPedido: ${prompt}`
      : `Construa a árvore COMPLETA (entre 15 e 70 nós; mais nós só se o material for realmente vasto), do iniciante ao ápice.${prompt ? `\nPedido adicional: ${prompt}` : ""}`;
    const res = await askJson({
      system: SYSTEM,
      effort: "high",
      timeoutMs: 1_200_000,
      prompt: `ÁREA: ${subject.title}\nOBJETIVO: ${subject.goal || "dominar a área"}\nNÍVEL ATUAL: ${subject.start_level || "iniciante"}  →  NÍVEL ALVO: ${subject.target_level || "ápice"}\nTEMPO: ${budgetText(subject)}\n\n${renderContext(ctx)}\n\nTAREFA: ${task}\n\n${OUTPUT_SPEC}`,
    });
    report(0.8, "Validando grafo e ligando evidências…");
    const n = persistNodes(subjectId, res.nodes || []);
    rescopeSubject(subjectId);
    db().prepare("UPDATE subjects SET updated_at=? WHERE id=?").run(now(), subjectId);
    logEvent(subjectId, extend ? "roadmap_extended" : "roadmap_created", null, { nodes: n });
    return { nodes: n };
  });
}


const BACK_GAP = 5; // trechos de folga: abaixo disso consideramos "mesma região"

/** Reconcilia o escopo: onde cada nó é ensinado, conceitos fora de lugar, e alinha a trilha à ordem do material. */
export function rescopeSubject(subjectId) {
  const stats = assignScopes(subjectId);
  const d = db();
  // janela principal de cada nó (fonte com mais trechos)
  const win = new Map();
  for (const r of d.prepare("SELECT ns.node_id nid, ns.source_id sid, ns.lo_ord lo, ns.hi_ord hi FROM node_scope ns JOIN nodes n ON n.id=ns.node_id WHERE n.subject_id=?").all(subjectId)) {
    const cur = win.get(r.nid);
    if (!cur || r.hi - r.lo > cur.hi - cur.lo) win.set(r.nid, r);
  }
  const nodes = d.prepare("SELECT id, branch, kind FROM nodes WHERE subject_id=?").all(subjectId);
  const branch = new Map(nodes.map((n) => [n.id, n.branch]));
  const capstone = new Set(nodes.filter((n) => n.kind === "capstone").map((n) => n.id));
  const totals = new Map(d.prepare("SELECT source_id sid, COUNT(*) n FROM chunks WHERE subject_id=? GROUP BY source_id").all(subjectId).map((r) => [r.sid, r.n]));

  // 1) pré-requisito "hard" que o material ensina DEPOIS do dependente contraria a graduação: remove
  let removed = 0;
  const del = d.prepare("DELETE FROM node_edges WHERE from_node=? AND to_node=?");
  const hard = () => d.prepare("SELECT e.from_node f, e.to_node t FROM node_edges e JOIN nodes n ON n.id=e.to_node WHERE n.subject_id=? AND e.kind='hard'").all(subjectId);
  for (const e of hard()) {
    const a = win.get(e.f), b = win.get(e.t);
    if (!capstone.has(e.t) && a && b && a.sid === b.sid && b.hi + BACK_GAP < a.lo) {
      del.run(e.f, e.t);
      removed++;
    }
  }
  // 2) nó ensinado depois do começo do material não pode ser raiz: liga-o ao que o material ensina logo antes
  let added = 0;
  const ins = d.prepare("INSERT OR IGNORE INTO node_edges(from_node, to_node, kind) VALUES (?,?, 'hard')");
  const hasHard = new Set(hard().map((e) => e.t));
  const byLo = [...win.entries()].sort((a, b) => a[1].lo - b[1].lo);
  for (const [nid, w] of byLo) {
    const startZone = (totals.get(w.sid) || 1) * 0.06;
    if (capstone.has(nid) || hasHard.has(nid) || w.lo <= startZone) continue;
    const earlier = byLo.filter(([id, x]) => id !== nid && x.sid === w.sid && x.hi < w.lo + 2 && x.lo < w.lo);
    if (!earlier.length) continue;
    const best = (list) => list.sort((a, b) => b[1].hi - a[1].hi || b[1].lo - a[1].lo)[0];
    const same = best(earlier.filter(([id]) => branch.get(id) === branch.get(nid)));
    const any = best(earlier.slice());
    for (const pick of new Set([same, any].filter(Boolean))) {
      ins.run(pick[0], nid);
      added++;
    }
  }
  // 3) projetos finais (capstone) integram o que veio antes: dependem do fim do seu ramo e seu conteúdo vem dos pré-requisitos
  const insChunk = d.prepare("INSERT OR IGNORE INTO node_chunks(node_id, chunk_id) VALUES (?,?)");
  const insScope = d.prepare("INSERT OR REPLACE INTO node_scope(node_id, source_id, lo_ord, hi_ord) VALUES (?,?,?,?)");
  for (const cap of capstone) {
    let pre = hard().filter((e) => e.t === cap).map((e) => e.f).filter((id) => !capstone.has(id));
    if (!pre.length) {
      const pool = [...win.entries()].filter(([id]) => id !== cap && !capstone.has(id));
      const sameBranch = pool.filter(([id]) => branch.get(id) === branch.get(cap));
      const pick = (sameBranch.length >= 2 ? sameBranch : pool).sort((a, b) => b[1].hi - a[1].hi).slice(0, 3).map(([id]) => id);
      for (const id of pick) {
        ins.run(id, cap);
        added++;
      }
      pre = pick;
    }
    const rows = [];
    for (const pid of pre) {
      const cs = d.prepare("SELECT nc.chunk_id id, c.ord, c.source_id sid FROM node_chunks nc JOIN chunks c ON c.id=nc.chunk_id WHERE nc.node_id=? ORDER BY c.ord").all(pid);
      rows.push(...cs.slice(0, 4));
    }
    if (rows.length) {
      d.prepare("DELETE FROM node_chunks WHERE node_id=?").run(cap);
      d.prepare("DELETE FROM node_scope WHERE node_id=?").run(cap);
      const bySid = new Map();
      for (const r of rows.slice(0, 16)) {
        insChunk.run(cap, r.id);
        const w = bySid.get(r.sid) || { lo: r.ord, hi: r.ord };
        w.lo = Math.min(w.lo, r.ord);
        w.hi = Math.max(w.hi, r.ord);
        bySid.set(r.sid, w);
      }
      for (const [sid, w] of bySid) insScope.run(cap, sid, w.lo, w.hi);
    }
  }
  // evita ciclos criados pelas ligações novas (por segurança, remove arestas que fecham ciclo)
  breakCycles(subjectId);
  recomputeTiers(subjectId);
  return { ...stats, backwardRemoved: removed, chained: added };
}

function breakCycles(subjectId) {
  const d = db();
  const edges = d.prepare("SELECT e.from_node f, e.to_node t FROM node_edges e JOIN nodes n ON n.id=e.to_node WHERE n.subject_id=? AND e.kind='hard'").all(subjectId);
  const out = new Map();
  for (const e of edges) (out.get(e.f) || out.set(e.f, []).get(e.f)).push(e.t);
  const state = new Map();
  const del = d.prepare("DELETE FROM node_edges WHERE from_node=? AND to_node=?");
  const visit = (u) => {
    state.set(u, 1);
    for (const v of out.get(u) || []) {
      if (state.get(v) === 1) del.run(u, v);
      else if (!state.get(v)) visit(v);
    }
    state.set(u, 2);
  };
  for (const n of d.prepare("SELECT id FROM nodes WHERE subject_id=?").all(subjectId)) if (!state.get(n.id)) visit(n.id);
}

/** Apaga a árvore (e o que foi gerado/progresso dela) para reconstruir com o motor atual. */
export function resetTree(subjectId) {
  const d = db();
  tx(() => {
    for (const t of ["attempts", "questions", "cards", "activities", "node_state"]) d.prepare(`DELETE FROM ${t} WHERE subject_id=?`).run(subjectId);
    d.prepare("DELETE FROM reviews WHERE card_id NOT IN (SELECT id FROM cards)").run();
    d.prepare("DELETE FROM nodes WHERE subject_id=?").run(subjectId); // cascata: edges, node_concepts/chunks/scope
  });
}
