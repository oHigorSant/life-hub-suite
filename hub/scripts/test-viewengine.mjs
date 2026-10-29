// Teste local do motor de visões (usa o cofre de exemplo num diretório temporário).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "view-test-"));
process.env.NOTAS_DIR = tmp;
const { buildGraph } = await import("../lib/notas/graph.js");
const { sanitizeView, DEFAULT_VIEWS } = await import("../lib/notas/views.js");
const { applyView } = await import("../components/notas/viewEngine.js");

const graph = buildGraph();
const mk = (v) => applyView(graph, sanitizeView(v));
const ids = (r, k) => r.elements.filter((e) => e.data.kind === k).map((e) => e.data.id);
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("ok  -", name); };

ok("visão geral: nós de nota + arestas link/mention", () => {
  const r = mk(DEFAULT_VIEWS[0]);
  assert.ok(ids(r, "note").length >= 5);
  assert.ok(r.elements.some((e) => e.data.kind === "link"));
  assert.ok(r.elements.some((e) => e.data.kind === "mention"));
});

ok("hierarquia: grupos aninhados Computação > SO > Windows", () => {
  const r = mk(DEFAULT_VIEWS[1]);
  const groups = r.elements.filter((e) => e.data.kind === "group").map((e) => e.data);
  const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
  assert.ok(byId["grp:computacao"], "grupo raiz");
  assert.equal(byId["grp:computacao/sistemas-operacionais"].parent, "grp:computacao");
  assert.equal(byId["grp:computacao/sistemas-operacionais/windows"].parent, "grp:computacao/sistemas-operacionais");
  const win = r.elements.find((e) => e.data.label === "Windows" && e.data.kind === "note");
  assert.equal(win.data.parent, "grp:computacao/sistemas-operacionais/windows");
});

ok("filtro por área com descendentes", () => {
  const r = mk({ filter: { areas: ["Sistemas Operacionais"] } });
  const titles = r.elements.filter((e) => e.data.kind === "note").map((e) => e.data.label).sort();
  assert.ok(titles.includes("Windows") && titles.includes("Linux") && titles.includes("Sistemas Operacionais"));
  assert.ok(!titles.includes("Back-end"));
});

ok("filtro por área sem descendentes", () => {
  const r = mk({ filter: { areas: ["Sistemas Operacionais"], includeDescendants: false } });
  const titles = r.elements.filter((e) => e.data.kind === "note").map((e) => e.data.label);
  assert.deepEqual(titles, ["Sistemas Operacionais"]);
});

ok("filtro por tag + modo all", () => {
  const any = mk({ filter: { tags: ["so", "servidores"], tagMode: "any" } });
  const all = mk({ filter: { tags: ["so", "servidores"], tagMode: "all" } });
  assert.ok(ids(any, "note").length > ids(all, "note").length);
  assert.deepEqual(all.elements.filter((e) => e.data.kind === "note").map((e) => e.data.label), ["Linux"]);
});

ok("tags viram nós e arestas tag", () => {
  const r = mk(DEFAULT_VIEWS[2]);
  assert.ok(ids(r, "tag").includes("tag:exemplo"));
  assert.ok(r.elements.some((e) => e.data.kind === "tag" && e.data.source));
  assert.ok(!r.elements.some((e) => e.data.kind === "link"));
});

ok("regras: cor/forma/ícone por tag", () => {
  const r = mk({ style: { nodeColorBy: "area" }, rules: [{ when: { tag: "servidores" }, set: { color: "#ff0000", shape: "star", icon: "server", size: 60 } }] });
  const linux = r.elements.find((e) => e.data.label === "Linux" && e.data.kind === "note").data;
  assert.equal(linux.color, "#ff0000");
  assert.equal(linux.shape, "star");
  assert.equal(linux.size, 60);
  assert.ok(linux.bg.startsWith("data:image/svg+xml"));
  const win = r.elements.find((e) => e.data.label === "Windows" && e.data.kind === "note").data;
  assert.notEqual(win.color, "#ff0000");
});

ok("regra por área (nome) aplica aos descendentes", () => {
  const r = mk({ rules: [{ when: { area: "Sistemas Operacionais" }, set: { color: "#00ff00" } }] });
  const win = r.elements.find((e) => e.data.label === "Windows" && e.data.kind === "note").data;
  const be = r.elements.find((e) => e.data.label === "Back-end" && e.data.kind === "note").data;
  assert.equal(win.color, "#00ff00");
  assert.notEqual(be.color, "#00ff00");
});

ok("foco: vizinhança de Windows (1 nível) exclui o resto", () => {
  const r = mk({ filter: { focus: "Windows", depth: 1 } });
  const titles = r.elements.filter((e) => e.data.kind === "note").map((e) => e.data.label);
  assert.ok(titles.includes("Windows"));
  assert.ok(!titles.includes("Back-end"), "Back-end está a 2 níveis");
  const r2 = mk({ filter: { focus: "Windows", depth: 2 } });
  assert.ok(r2.elements.filter((e) => e.data.kind === "note").length > titles.length);
});

ok("ocultar órfãos", () => {
  fs.writeFileSync(path.join(tmp, "Solta.md"), "# Solta\nsem links\n");
  const g2 = buildGraph();
  const r1 = applyView(g2, sanitizeView({ filter: { hideOrphans: false } }));
  const r2 = applyView(g2, sanitizeView({ filter: { hideOrphans: true } }));
  assert.ok(r1.elements.some((e) => e.data.label === "Solta"));
  assert.ok(!r2.elements.some((e) => e.data.label === "Solta"));
});

ok("hierarquia como arestas (sem agrupar)", () => {
  const r = mk({ show: { hierarchy: true, links: false, mentions: false }, group: "none" });
  assert.ok(ids(r, "areanode").length >= 3);
  assert.ok(r.elements.some((e) => e.data.kind === "hierarchy"));
});

ok("agrupar por tag", () => {
  const r = mk({ group: "tag" });
  assert.ok(r.elements.some((e) => e.data.kind === "group" && e.data.label.startsWith("#")));
});

ok("layouts válidos e stylesheet", () => {
  for (const l of ["fcose", "cose", "concentric", "breadthfirst", "circle", "grid"]) assert.equal(mk({ layout: l }).layout.name, l);
  assert.ok(mk({}).stylesheet.length > 10);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n} testes passaram`);
