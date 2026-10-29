import { loadNotes, readAreas, writeAreas, ensureAreaPath } from "./store.js";
import { norm } from "./parse.js";

/** Monta o grafo completo (nós, arestas, áreas, tags) a partir dos arquivos. As visões filtram isso no front. */
export function buildGraph() {
  const notes = loadNotes();
  const areas = readAreas();
  let changed = false;
  const areaOf = new Map();
  for (const n of notes) {
    if (!n.area) continue;
    const r = ensureAreaPath(areas, n.area);
    if (r.changed) changed = true;
    areaOf.set(n.path, r.id);
  }
  if (changed) writeAreas(areas);

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const chain = (id) => {
    const out = [];
    let cur = id;
    let guard = 0;
    while (cur && areaById.has(cur) && guard++ < 20) { out.unshift(cur); cur = areaById.get(cur).parent; }
    return out;
  };

  const byTitle = new Map();
  const byBase = new Map();
  for (const n of notes) {
    byTitle.set(norm(n.title), n.path);
    byBase.set(norm(n.base), n.path);
    byBase.set(norm(n.path.replace(/\.md$/i, "")), n.path);
  }
  const resolve = (name) => byTitle.get(norm(name)) || byBase.get(norm(name)) || null;

  const edges = [];
  const seen = new Set();
  const ghosts = new Map();
  const addEdge = (source, target, kind) => {
    if (source === target) return;
    const k = `${source}|${target}|${kind}`;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ id: `e${edges.length}`, source, target, kind });
  };

  for (const n of notes) {
    for (const l of n.links) {
      const t = resolve(l);
      if (t) addEdge(n.path, t, "link");
      else {
        const gid = `ghost:${norm(l)}`;
        if (!ghosts.has(gid)) ghosts.set(gid, { id: gid, title: l, ghost: true, type: "fantasma", area: null, areaPath: [], tags: [], words: 0, degree: 0 });
        addEdge(n.path, gid, "link");
      }
    }
    for (const m of n.mentions) {
      const t = resolve(m);
      if (t) addEdge(n.path, t, "mention");
    }
  }

  const degree = new Map();
  for (const e of edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }

  const tagCount = new Map();
  const nodes = notes.map((n) => {
    for (const t of n.tags) tagCount.set(t, (tagCount.get(t) || 0) + 1);
    const a = areaOf.get(n.path) || null;
    return {
      id: n.path,
      title: n.title,
      type: n.type,
      area: a,
      areaPath: chain(a),
      tags: n.tags,
      words: n.words,
      mtime: n.mtime,
      degree: degree.get(n.path) || 0,
    };
  });
  const ghostNodes = [...ghosts.values()].map((g) => ({ ...g, degree: degree.get(g.id) || 0 }));

  const areaCount = new Map();
  for (const n of nodes) for (const id of n.areaPath) areaCount.set(id, (areaCount.get(id) || 0) + 1);

  return {
    nodes,
    ghosts: ghostNodes,
    edges,
    areas: areas.map((a) => ({ ...a, count: areaCount.get(a.id) || 0 })),
    tags: [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    types: [...new Set(nodes.map((n) => n.type))].sort(),
  };
}

/** Entradas/saídas de uma nota específica (para o painel lateral do editor). */
export function relationsFor(path) {
  const g = buildGraph();
  const title = new Map([...g.nodes, ...g.ghosts].map((n) => [n.id, n.title]));
  const mk = (e, other) => ({ path: other, title: title.get(other) || other, kind: e.kind, ghost: other.startsWith("ghost:") });
  return {
    backlinks: g.edges.filter((e) => e.target === path).map((e) => mk(e, e.source)),
    outgoing: g.edges.filter((e) => e.source === path).map((e) => mk(e, e.target)),
  };
}
