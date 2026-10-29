// Aplica uma "visão" (filtro + agrupamento + estilo + regras) ao grafo completo e devolve
// elementos/estilo para o Cytoscape. Puro (sem DOM): dá para testar em Node.
import { iconDataUri } from "./icons.js";

export const PALETTE = ["#0c66e4", "#1f845a", "#c9372c", "#b38600", "#8270db", "#e56910", "#2898bd", "#ae4787", "#5e6c84", "#5aac44", "#ff8ed4", "#00b8d9"];
const SHAPE_CYCLE = ["ellipse", "round-rectangle", "diamond", "hexagon", "triangle", "octagon", "pentagon", "star"];

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const colorFor = (key) => PALETTE[hash(String(key)) % PALETTE.length];
const shapeFor = (key) => SHAPE_CYCLE[hash(String(key)) % SHAPE_CYCLE.length];

function areaMatches(node, ref, areaIndex) {
  // `ref` pode ser id ("computacao/windows"), nome ("Windows") ou caminho ("Computação > Windows")
  const r = norm(ref);
  if (!r) return false;
  return node.areaPath.some((id) => {
    const a = areaIndex.get(id);
    return id === ref || norm(id) === r || (a && norm(a.name) === r) || norm(areaFullName(a, areaIndex)) === r;
  });
}
function areaFullName(a, areaIndex) {
  if (!a) return "";
  const names = [];
  let cur = a;
  let guard = 0;
  while (cur && guard++ < 20) { names.unshift(cur.name); cur = cur.parent ? areaIndex.get(cur.parent) : null; }
  return names.join(" > ");
}

function ruleMatches(rule, node, areaIndex) {
  const w = rule.when || {};
  if (w.area && !areaMatches(node, w.area, areaIndex)) return false;
  if (w.tag && !(node.tags || []).includes(w.tag)) return false;
  if (w.type && node.type !== w.type) return false;
  if (w.text && !norm(node.title).includes(norm(w.text))) return false;
  if (w.minDegree != null && !(node.degree >= w.minDegree)) return false;
  return true;
}

export function applyView(graph, view) {
  const f = view.filter || {};
  const show = view.show || {};
  const st = view.style || {};
  const areaIndex = new Map(graph.areas.map((a) => [a.id, a]));

  // 1) nós candidatos
  let nodes = [...graph.nodes];
  if (!f.hideGhosts) nodes = nodes.concat(graph.ghosts);

  const selAreas = f.areas || [];
  if (selAreas.length) {
    nodes = nodes.filter((n) => selAreas.some((ref) => {
      if (f.includeDescendants !== false) return areaMatches(n, ref, areaIndex);
      const a = n.area ? areaIndex.get(n.area) : null;
      return n.area && (n.area === ref || norm(a?.name) === norm(ref));
    }));
  }
  if ((f.tags || []).length) {
    nodes = nodes.filter((n) => (f.tagMode === "all" ? f.tags.every((t) => n.tags.includes(t)) : f.tags.some((t) => n.tags.includes(t))));
  }
  if ((f.types || []).length) nodes = nodes.filter((n) => f.types.includes(n.type));
  if (f.text) nodes = nodes.filter((n) => norm(n.title).includes(norm(f.text)));

  const kinds = new Set();
  if (show.links !== false) kinds.add("link");
  if (show.mentions !== false) kinds.add("mention");

  // foco: vizinhança de uma nota até N níveis
  if (f.focus) {
    const start = graph.nodes.concat(graph.ghosts).find((n) => n.id === f.focus || norm(n.title) === norm(f.focus));
    if (start) {
      const adj = new Map();
      for (const e of graph.edges) {
        if (!kinds.has(e.kind)) continue;
        if (!adj.has(e.source)) adj.set(e.source, []);
        if (!adj.has(e.target)) adj.set(e.target, []);
        adj.get(e.source).push(e.target);
        adj.get(e.target).push(e.source);
      }
      const seen = new Set([start.id]);
      let frontier = [start.id];
      for (let d = 0; d < (f.depth || 2); d++) {
        const next = [];
        for (const id of frontier) for (const nb of adj.get(id) || []) if (!seen.has(nb)) { seen.add(nb); next.push(nb); }
        frontier = next;
      }
      const keep = new Set(nodes.map((n) => n.id));
      nodes = graph.nodes.concat(graph.ghosts).filter((n) => seen.has(n.id) && (keep.has(n.id) || n.id === start.id));
    }
  }

  const kept = new Map(nodes.map((n) => [n.id, n]));
  let edges = graph.edges.filter((e) => kinds.has(e.kind) && kept.has(e.source) && kept.has(e.target));

  // 2) nós de tag (opcional)
  const extraNodes = [];
  if (show.tags) {
    const want = (f.tags || []).length ? new Set(f.tags) : null;
    for (const n of nodes) {
      if (n.ghost) continue;
      for (const t of n.tags) {
        if (want && !want.has(t)) continue;
        const id = `tag:${t}`;
        if (!extraNodes.find((x) => x.id === id)) extraNodes.push({ id, title: `#${t}`, kind: "tag", tag: t, tags: [], areaPath: [], degree: 0, words: 0, type: "tag" });
        edges.push({ id: `t_${n.id}_${t}`, source: n.id, target: id, kind: "tag" });
      }
    }
  }

  // 3) nós de área como nós normais + arestas de hierarquia (quando não agrupa por área)
  if (show.hierarchy && view.group !== "area") {
    const used = new Set();
    for (const n of nodes) for (const id of n.areaPath) used.add(id);
    for (const id of used) {
      const a = areaIndex.get(id);
      if (!a) continue;
      extraNodes.push({ id: `area:${id}`, title: a.name, kind: "areanode", areaId: id, tags: [], areaPath: [id], degree: 0, words: 0, type: "area" });
      if (a.parent && used.has(a.parent)) edges.push({ id: `h_${id}`, source: `area:${a.parent}`, target: `area:${id}`, kind: "hierarchy" });
    }
    for (const n of nodes) if (n.area && used.has(n.area)) edges.push({ id: `ha_${n.id}`, source: `area:${n.area}`, target: n.id, kind: "hierarchy" });
  }

  // 4) grau local e órfãos
  const deg = new Map();
  for (const e of edges) { deg.set(e.source, (deg.get(e.source) || 0) + 1); deg.set(e.target, (deg.get(e.target) || 0) + 1); }
  let all = nodes.concat(extraNodes);
  if (f.hideOrphans) all = all.filter((n) => (deg.get(n.id) || 0) > 0);
  const present = new Set(all.map((n) => n.id));
  edges = edges.filter((e) => present.has(e.source) && present.has(e.target));
  for (const n of all) n.ldeg = deg.get(n.id) || 0;

  // 5) agrupamento (nós compostos = "delimitações")
  const compounds = new Map();
  const parentOf = new Map();
  if (view.group === "area") {
    for (const n of all) {
      if (n.kind || n.ghost || !n.areaPath.length) continue;
      const chain = n.areaPath;
      chain.forEach((id, i) => {
        if (!compounds.has(id)) {
          const a = areaIndex.get(id);
          compounds.set(id, { id: `grp:${id}`, label: a?.name || id, color: a?.color || colorFor(id), border: a?.border || "dashed", parent: i > 0 ? `grp:${chain[i - 1]}` : undefined, icon: a?.icon });
        }
      });
      parentOf.set(n.id, `grp:${chain[chain.length - 1]}`);
    }
  } else if (view.group === "tag") {
    const counts = new Map(graph.tags.map((t) => [t.tag, t.count]));
    for (const n of all) {
      if (n.kind || n.ghost || !n.tags.length) continue;
      const wanted = (f.tags || []).length ? n.tags.filter((t) => f.tags.includes(t)) : n.tags;
      const t = [...(wanted.length ? wanted : n.tags)].sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))[0];
      if (!compounds.has(t)) compounds.set(t, { id: `grp:tag:${t}`, label: `#${t}`, color: colorFor(t), border: "dashed" });
      parentOf.set(n.id, `grp:tag:${t}`);
    }
  }

  // 6) estilo de cada nó
  const maxDeg = Math.max(1, ...all.map((n) => n.ldeg));
  const typeShape = new Map();
  const elements = [];
  for (const c of compounds.values()) {
    elements.push({ data: { id: c.id, label: c.label, color: c.color, border: c.border, kind: "group", parent: c.parent } });
  }
  for (const n of all) {
    const leaf = n.area ? areaIndex.get(n.area) : null;
    let color = st.fixedColor || "#0c66e4";
    if (n.kind === "tag") color = colorFor(n.tag);
    else if (n.kind === "areanode") color = areaIndex.get(n.areaId)?.color || "#5e6c84";
    else if (n.ghost) color = "#c1c7d0";
    else if (st.nodeColorBy === "area") color = leaf?.color || "#8993a4";
    else if (st.nodeColorBy === "tag") color = n.tags[0] ? colorFor(n.tags[0]) : "#8993a4";
    else if (st.nodeColorBy === "type") color = colorFor(n.type);

    let shape = "ellipse";
    if (n.kind === "tag") shape = "round-tag";
    else if (n.kind === "areanode") shape = "round-rectangle";
    else if (n.ghost) shape = "ellipse";
    else if (st.nodeShapeBy === "type") { if (!typeShape.has(n.type)) typeShape.set(n.type, shapeFor(n.type)); shape = typeShape.get(n.type); }
    else if (st.nodeShapeBy === "area") shape = leaf?.shape || shapeFor(n.area || "none");

    let size = 30;
    if (n.kind === "tag") size = 26;
    else if (n.kind === "areanode") size = 34;
    else if (st.sizeBy === "degree") size = 22 + Math.round((n.ldeg / maxDeg) * 30);
    else if (st.sizeBy === "words") size = 22 + Math.min(30, Math.round(Math.sqrt(n.words || 0) * 1.1));

    let border = n.ghost ? "dashed" : "solid";
    let icon = n.kind ? null : leaf?.icon || null;

    if (!n.kind) {
      for (const r of view.rules || []) {
        if (!ruleMatches(r, n, areaIndex)) continue;
        if (r.set.color) color = r.set.color;
        if (r.set.shape) shape = r.set.shape;
        if (r.set.size) size = r.set.size;
        if (r.set.border) border = r.set.border;
        if (r.set.icon) icon = r.set.icon;
      }
    }

    const data = { id: n.id, label: n.title, color, shape, size, border, kind: n.kind || (n.ghost ? "ghost" : "note"), degree: n.ldeg };
    if (n.kind !== "tag" && n.kind !== "areanode") { data.path = n.ghost ? null : n.id; data.area = n.area; data.tags = (n.tags || []).join(","); data.type = n.type; }
    if (icon) data.bg = iconDataUri(icon);
    const p = parentOf.get(n.id);
    if (p) data.parent = p;
    elements.push({ data });
  }
  for (const e of edges) elements.push({ data: { id: e.id, source: e.source, target: e.target, kind: e.kind } });

  return { elements, stylesheet: buildStyle(view, show), layout: layoutFor(view.layout, maxDeg), counts: { nodes: all.length, edges: edges.length, groups: compounds.size } };
}

function buildStyle(view, show) {
  const st = view.style || {};
  const edgeColor = st.edgeColor || "#a5adba";
  return [
    { selector: "node", style: {
      "background-color": "data(color)", shape: "data(shape)", width: "data(size)", height: "data(size)",
      label: show.labels === false ? "" : "data(label)", color: "#172b4d", "font-size": 11, "font-weight": 500,
      "text-valign": "bottom", "text-margin-y": 5, "text-wrap": "ellipsis", "text-max-width": 120,
      "text-background-color": "#ffffff", "text-background-opacity": 0.75, "text-background-padding": 2, "text-background-shape": "roundrectangle",
      "border-width": 2, "border-color": "#ffffff", "border-style": "solid", "overlay-opacity": 0,
    } },
    { selector: "node[bg]", style: { "background-image": "data(bg)", "background-fit": "contain", "background-width": "62%", "background-height": "62%", "background-clip": "none" } },
    { selector: 'node[border = "dashed"]', style: { "border-style": "dashed", "border-color": "data(color)", "border-width": 2.5, "background-opacity": 0.55 } },
    { selector: 'node[border = "dotted"]', style: { "border-style": "dotted", "border-color": "data(color)", "border-width": 3 } },
    { selector: 'node[border = "double"]', style: { "border-style": "double", "border-color": "data(color)", "border-width": 5 } },
    { selector: 'node[kind = "ghost"]', style: { "background-opacity": 0.35, color: "#6b778c" } },
    { selector: 'node[kind = "tag"]', style: { "font-size": 10, color: "#42526e" } },
    { selector: 'node[kind = "group"]', style: {
      shape: "round-rectangle", "background-color": "data(color)", "background-opacity": 0.07, "border-color": "data(color)", "border-width": 1.6,
      "border-style": "data(border)", label: "data(label)", "text-valign": "top", "text-halign": "center", "text-margin-y": -4,
      color: "data(color)", "font-weight": 700, "font-size": 12, padding: "18px", "text-background-opacity": 0, "text-wrap": "none", "text-max-width": 400,
    } },
    { selector: "edge", style: { width: 1.4, "line-color": edgeColor, "curve-style": "bezier", "target-arrow-shape": "none", opacity: 0.85 } },
    { selector: 'edge[kind = "link"]', style: { "target-arrow-shape": "triangle", "target-arrow-color": edgeColor, "arrow-scale": 0.8 } },
    { selector: 'edge[kind = "mention"]', style: { "line-style": "dashed", "target-arrow-shape": "vee", "target-arrow-color": edgeColor } },
    { selector: 'edge[kind = "tag"]', style: { "line-style": "dotted", "line-color": "#c1c7d0", width: 1 } },
    { selector: 'edge[kind = "hierarchy"]', style: { "line-style": "dotted", "line-color": "#8993a4", width: 1.6 } },
    { selector: ".faded", style: { opacity: 0.12 } },
    { selector: "node:selected", style: { "border-width": 4, "border-color": "#172b4d" } },
    { selector: "edge:selected", style: { width: 3, "line-color": "#172b4d" } },
  ];
}

function layoutFor(name, maxDeg) {
  switch (name) {
    case "concentric":
      return { name: "concentric", animate: false, minNodeSpacing: 24, concentric: (n) => n.data("degree") || 0, levelWidth: () => Math.max(1, Math.ceil(maxDeg / 4)), padding: 30 };
    case "breadthfirst":
      return { name: "breadthfirst", animate: false, directed: true, spacingFactor: 1.15, padding: 30 };
    case "circle":
      return { name: "circle", animate: false, padding: 30 };
    case "grid":
      return { name: "grid", animate: false, padding: 30, avoidOverlap: true };
    case "cose":
      return { name: "cose", animate: false, padding: 30, nodeRepulsion: () => 9000, idealEdgeLength: () => 80 };
    default:
      return { name: "fcose", quality: "default", randomize: true, animate: false, padding: 30, nodeRepulsion: () => 9000, idealEdgeLength: () => 85, nestingFactor: 0.2, gravity: 0.3, gravityRangeCompound: 1.5, packComponents: true };
  }
}

export function describeView(view) {
  const f = view.filter || {};
  const parts = [];
  if ((f.areas || []).length) parts.push(`áreas: ${f.areas.join(", ")}`);
  if ((f.tags || []).length) parts.push(`tags: ${f.tags.map((t) => "#" + t).join(" ")}`);
  if ((f.types || []).length) parts.push(`tipos: ${f.types.join(", ")}`);
  if (f.text) parts.push(`texto: "${f.text}"`);
  if (f.focus) parts.push(`foco: ${f.focus} (${f.depth} níveis)`);
  return parts.join(" · ") || "todas as notas";
}
