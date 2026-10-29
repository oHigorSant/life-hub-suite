// Visões do grafo: uma "consulta" salva (filtro + agrupamento + estilo), como uma view de SQL
// sobre a mesma base de notas. O servidor só valida/guarda; quem aplica é o front (viewEngine).

export const SHAPES = ["ellipse", "round-rectangle", "rectangle", "diamond", "hexagon", "octagon", "star", "triangle", "pentagon", "tag", "round-tag", "vee", "barrel"];
export const LAYOUTS = ["fcose", "cose", "concentric", "breadthfirst", "circle", "grid"];
export const ICONS = ["file-text", "server", "cpu", "database", "globe", "code", "terminal", "shield", "book", "star", "flag", "folder", "layers", "zap", "cloud", "lock", "bug", "brain"];
export const BORDERS = ["solid", "dashed", "dotted", "double"];

const COLOR_BY = ["area", "tag", "type", "fixed"];
const SHAPE_BY = ["none", "type", "area"];
const SIZE_BY = ["fixed", "degree", "words"];
const GROUP = ["none", "area", "tag"];
const TAG_MODE = ["any", "all"];

const hex = (c, d = null) => (/^#[0-9a-f]{6}$/i.test(c ?? "") ? c : d);
const strList = (v, max = 100) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : []);
const pick = (v, list, d) => (list.includes(v) ? v : d);

export function sanitizeRule(r) {
  const when = r?.when ?? {};
  const set = r?.set ?? {};
  const out = {
    when: {},
    set: {},
  };
  if (when.area) out.when.area = String(when.area).slice(0, 200);
  if (when.tag) out.when.tag = String(when.tag).replace(/^#/, "").toLowerCase().slice(0, 80);
  if (when.type) out.when.type = String(when.type).toLowerCase().slice(0, 40);
  if (when.text) out.when.text = String(when.text).slice(0, 120);
  if (Number.isFinite(Number(when.minDegree)) && when.minDegree !== "" && when.minDegree != null) out.when.minDegree = Math.max(0, Math.min(999, Number(when.minDegree)));
  if (hex(set.color)) out.set.color = set.color;
  if (SHAPES.includes(set.shape)) out.set.shape = set.shape;
  if (ICONS.includes(set.icon)) out.set.icon = set.icon;
  if (Number.isFinite(Number(set.size)) && set.size !== "" && set.size != null) out.set.size = Math.max(10, Math.min(120, Number(set.size)));
  if (BORDERS.includes(set.border)) out.set.border = set.border;
  return out;
}

export function sanitizeView(v) {
  const f = v?.filter ?? {};
  const s = v?.show ?? {};
  const st = v?.style ?? {};
  const id = String(v?.id || `view_${Math.random().toString(36).slice(2, 10)}`).replace(/[^A-Za-z0-9_\-]/g, "").slice(0, 60) || `view_${Date.now()}`;
  return {
    id,
    name: String(v?.name || "Visão sem nome").slice(0, 80),
    description: String(v?.description ?? "").slice(0, 300),
    filter: {
      areas: strList(f.areas),
      includeDescendants: f.includeDescendants !== false,
      tags: strList(f.tags).map((t) => t.replace(/^#/, "").toLowerCase()),
      tagMode: pick(f.tagMode, TAG_MODE, "any"),
      types: strList(f.types).map((t) => t.toLowerCase()),
      text: String(f.text ?? "").slice(0, 120),
      focus: f.focus ? String(f.focus).slice(0, 300) : "",
      depth: Number.isFinite(Number(f.depth)) ? Math.max(1, Math.min(6, Number(f.depth))) : 2,
      hideOrphans: !!f.hideOrphans,
      hideGhosts: f.hideGhosts !== false,
    },
    show: {
      links: s.links !== false,
      mentions: s.mentions !== false,
      tags: !!s.tags,
      hierarchy: !!s.hierarchy,
      labels: s.labels !== false,
    },
    group: pick(v?.group, GROUP, "none"),
    style: {
      nodeColorBy: pick(st.nodeColorBy, COLOR_BY, "area"),
      nodeShapeBy: pick(st.nodeShapeBy, SHAPE_BY, "none"),
      sizeBy: pick(st.sizeBy, SIZE_BY, "degree"),
      fixedColor: hex(st.fixedColor, "#0c66e4"),
      edgeColor: hex(st.edgeColor, "#a5adba"),
      background: hex(st.background, "#fafbfc"),
    },
    rules: (Array.isArray(v?.rules) ? v.rules : []).slice(0, 40).map(sanitizeRule).filter((r) => Object.keys(r.set).length),
    layout: pick(v?.layout, LAYOUTS, "fcose"),
  };
}

export const DEFAULT_VIEWS = [
  {
    id: "view_geral",
    name: "Visão geral",
    description: "Todas as notas, ligadas por links e menções; cor pela área.",
    filter: {},
    show: { links: true, mentions: true, tags: false, hierarchy: false },
    group: "none",
    style: { nodeColorBy: "area", sizeBy: "degree" },
    layout: "fcose",
  },
  {
    id: "view_hierarquia",
    name: "Hierarquia de áreas",
    description: "Áreas pai e filhas como delimitações aninhadas (ex.: Computação > Sistemas Operacionais > Windows).",
    filter: {},
    show: { links: true, mentions: true, tags: false, hierarchy: false },
    group: "area",
    style: { nodeColorBy: "area", sizeBy: "fixed" },
    layout: "fcose",
  },
  {
    id: "view_tags",
    name: "Por tags",
    description: "As tags viram nós; as notas se agrupam em volta delas.",
    filter: {},
    show: { links: false, mentions: false, tags: true, hierarchy: false },
    group: "none",
    style: { nodeColorBy: "type", nodeShapeBy: "type", sizeBy: "fixed" },
    layout: "fcose",
  },
  {
    id: "view_conexoes",
    name: "Mais conectadas",
    description: "Quanto mais ligada a nota, maior e mais ao centro.",
    filter: { hideOrphans: true },
    show: { links: true, mentions: true, tags: false, hierarchy: false },
    group: "none",
    style: { nodeColorBy: "fixed", sizeBy: "degree" },
    layout: "concentric",
  },
];
