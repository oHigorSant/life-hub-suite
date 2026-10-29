import { db, parse, tx } from "./db.js";

// Escopo progressivo: o aluno só conhece o NÓ ATUAL + seus ANCESTRAIS (pré-requisitos hard).
// Tudo que o material ensina depois disso é "fora de escopo" — nunca entra em lição, quiz ou cartão.

const GAP = 4; // trechos de distância que separam "primeira exposição" de menções posteriores
const CLUSTER_GAP = 10;
const MAX_NODE_CHUNKS = 16;

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const words = (t, max = 10) => [...new Set(norm(t).split(" ").filter((w) => w.length > 3))].slice(0, max);

export function ancestorsMap(subjectId) {
  const parents = new Map();
  for (const e of db().prepare("SELECT e.from_node f, e.to_node t FROM node_edges e JOIN nodes n ON n.id=e.to_node WHERE n.subject_id=? AND e.kind='hard'").all(subjectId)) {
    if (!parents.has(e.t)) parents.set(e.t, []);
    parents.get(e.t).push(e.f);
  }
  const memo = new Map();
  const anc = (id, stack = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return new Set();
    stack.add(id);
    const out = new Set();
    for (const p of parents.get(id) || []) {
      out.add(p);
      for (const a of anc(p, stack)) out.add(a);
    }
    stack.delete(id);
    memo.set(id, out);
    return out;
  };
  return { anc, parents };
}

/** Runs contíguos (gap ≤ GAP) das posições em que cada conceito aparece, por fonte; "home" = primeiro run. */
export function conceptHomes(subjectId) {
  const rows = db()
    .prepare(
      `SELECT cc.concept_id cid, ch.source_id sid, ch.ord, ch.id chunk
       FROM concept_chunks cc JOIN chunks ch ON ch.id=cc.chunk_id WHERE ch.subject_id=? ORDER BY cc.concept_id, ch.source_id, ch.ord`
    )
    .all(subjectId);
  const homes = new Map(); // cid -> Map(sid -> {lo, hi, chunks:[{id,ord}]})
  let cur = null;
  for (const r of rows) {
    const key = `${r.cid}|${r.sid}`;
    if (!cur || cur.key !== key) {
      cur = { key, done: false, last: r.ord };
      if (!homes.has(r.cid)) homes.set(r.cid, new Map());
      homes.get(r.cid).set(r.sid, { lo: r.ord, hi: r.ord, chunks: [{ id: r.chunk, ord: r.ord }] });
      continue;
    }
    if (cur.done) continue;
    if (r.ord - cur.last > GAP) {
      cur.done = true; // fim do primeiro run: o resto são retomadas posteriores
      continue;
    }
    const h = homes.get(r.cid).get(r.sid);
    h.hi = r.ord;
    h.chunks.push({ id: r.chunk, ord: r.ord });
    cur.last = r.ord;
  }
  return homes;
}

export function sourceTotals(subjectId) {
  return new Map(db().prepare("SELECT source_id sid, COUNT(*) n FROM chunks WHERE subject_id=? GROUP BY source_id").all(subjectId).map((r) => [r.sid, r.n]));
}

/** Posição (0-100) em que o material introduz cada conceito (fonte principal do conceito). */
export function conceptPositions(subjectId) {
  const homes = conceptHomes(subjectId);
  const totals = sourceTotals(subjectId);
  const out = new Map();
  for (const [cid, bySrc] of homes) {
    let best = null;
    for (const [sid, h] of bySrc) {
      const pct = Math.round((h.lo / Math.max(1, totals.get(sid) || 1)) * 100);
      if (best == null || pct < best) best = pct;
    }
    out.set(cid, best);
  }
  return out;
}

function clusterRuns(items) {
  // items: [{sid, lo, hi, w, cid}] -> clusters por fonte, unindo runs a ≤ CLUSTER_GAP de distância
  const bySrc = new Map();
  for (const it of items) {
    if (!bySrc.has(it.sid)) bySrc.set(it.sid, []);
    bySrc.get(it.sid).push(it);
  }
  const clusters = [];
  for (const [sid, list] of bySrc) {
    list.sort((a, b) => a.lo - b.lo);
    let cur = null;
    for (const it of list) {
      if (cur && it.lo - cur.hi <= CLUSTER_GAP) {
        cur.hi = Math.max(cur.hi, it.hi);
        cur.w += it.w;
        cur.items.push(it);
      } else {
        cur = { sid, lo: it.lo, hi: it.hi, w: it.w, items: [it] };
        clusters.push(cur);
      }
    }
  }
  return clusters;
}

/** Recalcula, para todos os nós da área, onde cada um é ENSINADO no material (sem menções posteriores). */
export function assignScopes(subjectId) {
  const d = db();
  const nodes = d.prepare("SELECT id, title, branch, tier, objectives_json FROM nodes WHERE subject_id=?").all(subjectId);
  const homes = conceptHomes(subjectId);
  const conceptInfo = new Map(d.prepare("SELECT id, title, importance FROM concepts WHERE subject_id=?").all(subjectId).map((c) => [c.id, c]));
  const nodeConcepts = new Map();
  for (const r of d.prepare("SELECT nc.node_id nid, nc.concept_id cid FROM node_concepts nc JOIN nodes n ON n.id=nc.node_id WHERE n.subject_id=?").all(subjectId)) {
    if (!nodeConcepts.has(r.nid)) nodeConcepts.set(r.nid, []);
    nodeConcepts.get(r.nid).push(r.cid);
  }

  // 1ª passada: cluster principal de cada nó + conceitos "fora de lugar"
  const plan = new Map();
  for (const n of nodes) {
    const cids = nodeConcepts.get(n.id) || [];
    const items = [];
    for (const cid of cids) {
      const bySrc = homes.get(cid);
      if (!bySrc) continue;
      for (const [sid, h] of bySrc) items.push({ sid, lo: h.lo, hi: h.hi, w: conceptInfo.get(cid)?.importance || 3, cid, chunks: h.chunks });
    }
    const clusters = clusterRuns(items);
    const primary = clusters.sort((a, b) => b.w - a.w || a.lo - b.lo)[0] || null;
    const inPrimary = new Set(primary ? primary.items.map((i) => i.cid) : []);
    const keep = cids.filter((cid) => !homes.has(cid) || inPrimary.has(cid));
    const misfiled = cids.filter((cid) => homes.has(cid) && !inPrimary.has(cid));
    plan.set(n.id, { node: n, primary, keep, misfiled });
  }

  // 2ª passada: conceitos fora de lugar vão para o nó cujo cluster os contém (ou o mais próximo)
  const moves = [];
  for (const { node, misfiled } of plan.values()) {
    for (const cid of misfiled) {
      const bySrc = homes.get(cid);
      let best = null;
      for (const [nid, p] of plan) {
        if (!p.primary || nid === node.id) continue;
        for (const [sid, h] of bySrc) {
          if (sid !== p.primary.sid) continue;
          const dist = h.lo >= p.primary.lo && h.lo <= p.primary.hi ? 0 : Math.min(Math.abs(h.lo - p.primary.lo), Math.abs(h.lo - p.primary.hi));
          const score = dist + (p.node.branch === node.branch ? 0 : 1.5);
          if (dist <= 6 && (!best || score < best.score)) best = { nid, score };
        }
      }
      moves.push({ from: node.id, cid, to: best?.nid || null });
    }
  }

  const delNC = d.prepare("DELETE FROM node_concepts WHERE node_id=? AND concept_id=?");
  const insNC = d.prepare("INSERT OR IGNORE INTO node_concepts(node_id, concept_id) VALUES (?,?)");
  const insChunk = d.prepare("INSERT OR IGNORE INTO node_chunks(node_id, chunk_id) VALUES (?,?)");
  const insScope = d.prepare("INSERT OR REPLACE INTO node_scope(node_id, source_id, lo_ord, hi_ord) VALUES (?,?,?,?)");
  const fts = d.prepare("SELECT c.id, c.ord, c.source_id sid FROM chunks_fts f JOIN chunks c ON c.id=f.rowid WHERE chunks_fts MATCH ? AND c.subject_id=? ORDER BY rank LIMIT 8");
  const stats = { nodes: nodes.length, moved: 0, dropped: 0 };

  tx(() => {
    d.prepare("DELETE FROM node_chunks WHERE node_id IN (SELECT id FROM nodes WHERE subject_id=?)").run(subjectId);
    d.prepare("DELETE FROM node_scope WHERE node_id IN (SELECT id FROM nodes WHERE subject_id=?)").run(subjectId);
    for (const m of moves) {
      delNC.run(m.from, m.cid);
      if (m.to) {
        insNC.run(m.to, m.cid);
        plan.get(m.to).keep.push(m.cid);
        stats.moved++;
      } else stats.dropped++;
    }
    for (const { node, primary, keep } of plan.values()) {
      // trechos: onde os conceitos do nó SÃO ENSINADOS (home run dentro do cluster principal)
      const weight = new Map();
      const ordOf = new Map();
      for (const cid of keep) {
        const bySrc = homes.get(cid);
        if (!bySrc) continue;
        for (const [sid, h] of bySrc) {
          if (primary && (sid !== primary.sid || h.lo < primary.lo || h.lo > primary.hi + 0)) continue;
          for (const c of h.chunks) {
            weight.set(c.id, (weight.get(c.id) || 0) + (conceptInfo.get(cid)?.importance || 3));
            ordOf.set(c.id, { ord: c.ord, sid });
          }
        }
      }
      let chosen = [...weight.entries()].sort((a, b) => b[1] - a[1] || ordOf.get(a[0]).ord - ordOf.get(b[0]).ord).slice(0, MAX_NODE_CHUNKS).map(([id]) => id);
      if (chosen.length < 3) {
        // pouco material ligado aos conceitos: busca textual, mas só perto do cluster principal (ou o melhor trecho)
        const q = words(node.title + " " + (parse(node.objectives_json, []) || []).join(" ")).map((w) => `"${w}"`).join(" OR ");
        if (q) {
          try {
            const hits = fts.all(q, subjectId);
            const anchor = primary ? { sid: primary.sid, lo: primary.lo - 8, hi: primary.hi + 8 } : hits[0] ? { sid: hits[0].sid, lo: hits[0].ord - 6, hi: hits[0].ord + 6 } : null;
            for (const h of hits) if (anchor && h.sid === anchor.sid && h.ord >= anchor.lo && h.ord <= anchor.hi && !chosen.includes(h.id)) {
              chosen.push(h.id);
              ordOf.set(h.id, { ord: h.ord, sid: h.sid });
            }
          } catch {}
        }
      }
      const bySid = new Map();
      for (const id of chosen) {
        insChunk.run(node.id, id);
        const o = ordOf.get(id);
        if (!o) continue;
        const w = bySid.get(o.sid) || { lo: o.ord, hi: o.ord };
        w.lo = Math.min(w.lo, o.ord);
        w.hi = Math.max(w.hi, o.ord);
        bySid.set(o.sid, w);
      }
      for (const [sid, w] of bySid) insScope.run(node.id, sid, w.lo, w.hi);
    }
  });
  return stats;
}

/** O que o aluno pode ter visto ao chegar neste nó, e o que é terminantemente proibido cobrar. */
export function scopeFor(nodeId) {
  const d = db();
  const node = d.prepare("SELECT * FROM nodes WHERE id=?").get(nodeId);
  const subjectId = node.subject_id;
  const { anc } = ancestorsMap(subjectId);
  const ancestors = [...anc(nodeId)];
  const seenIds = new Set([nodeId, ...ancestors]);
  const nodes = d.prepare("SELECT id, title, tier FROM nodes WHERE subject_id=?").all(subjectId);
  const tierOf = new Map(nodes.map((n) => [n.id, n.tier]));

  // teto por fonte: maior posição do material coberta pelo nó + ancestrais
  const ceil = new Map();
  for (const r of d.prepare(`SELECT source_id sid, MAX(hi_ord) hi FROM node_scope WHERE node_id IN (${[...seenIds].map(() => "?").join(",")}) GROUP BY source_id`).all(...seenIds)) ceil.set(r.sid, r.hi);

  const conceptsOf = d.prepare(
    "SELECT c.id, c.title, c.definition, c.importance, nc.node_id nid FROM node_concepts nc JOIN concepts c ON c.id=nc.concept_id JOIN nodes n ON n.id=nc.node_id WHERE n.subject_id=?"
  ).all(subjectId);
  const homes = conceptHomes(subjectId);

  const known = conceptsOf
    .filter((c) => ancestors.includes(c.nid))
    .sort((a, b) => (tierOf.get(b.nid) ?? 0) - (tierOf.get(a.nid) ?? 0) || b.importance - a.importance)
    .slice(0, 40)
    .map((c) => ({ id: c.id, title: c.title, definition: c.definition }));

  // proibido: conceitos de nós que o aluno ainda não viu + conceitos do material posteriores ao teto
  const forbidden = new Map();
  const desc = new Set();
  for (const n of nodes) if (n.id !== nodeId && !seenIds.has(n.id) && anc(n.id).has(nodeId)) desc.add(n.id);
  for (const c of conceptsOf) {
    if (seenIds.has(c.nid) || forbidden.has(c.id)) continue;
    forbidden.set(c.id, { title: c.title, rank: (desc.has(c.nid) ? 0 : 1000) + Math.abs((tierOf.get(c.nid) ?? 0) - node.tier) });
  }
  for (const c of d.prepare("SELECT id, title FROM concepts WHERE subject_id=? AND id NOT IN (SELECT concept_id FROM node_concepts)").all(subjectId)) {
    const bySrc = homes.get(c.id);
    if (!bySrc) continue;
    for (const [sid, h] of bySrc) if (ceil.has(sid) && h.lo > ceil.get(sid)) forbidden.set(c.id, { title: c.title, rank: 2000 + (h.lo - ceil.get(sid)) });
  }
  // conceitos já ligados ao nó/ancestrais nunca entram na lista proibida
  for (const c of conceptsOf) if (seenIds.has(c.nid)) forbidden.delete(c.id);

  const forbiddenTitles = [...forbidden.values()].sort((a, b) => a.rank - b.rank).slice(0, 150).map((f) => f.title);
  return { node, ancestors, ceiling: Object.fromEntries(ceil), known, forbidden: forbiddenTitles, forbiddenTotal: forbidden.size };
}
