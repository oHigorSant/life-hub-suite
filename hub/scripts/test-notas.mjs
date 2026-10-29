// Teste local da camada de dados de Notas (usa um cofre temporário).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "notas-test-"));
process.env.NOTAS_DIR = tmp;

const store = await import("../lib/notas/store.js");
const { buildGraph, relationsFor } = await import("../lib/notas/graph.js");
const { parseNote, setFrontmatterKey, extractTags } = await import("../lib/notas/parse.js");
const views = await import("../lib/notas/views.js");

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("ok  -", name); };

ok("parse: título, tags, links, menções, área", () => {
  const raw = "---\ntipo: conceito\narea: A > B\ntags: [x, y]\n---\n# Meu Título\nTexto #z [[Outra Nota|apelido]] @Fulano @\"Nome Composto\" `#naoetag` [[Outra Nota]]\n```\n#codigo [[naolink]]\n```\n";
  const p = parseNote(raw, "pasta/arq.md");
  assert.equal(p.title, "Meu Título");
  assert.equal(p.type, "conceito");
  assert.equal(p.area, "A > B");
  assert.deepEqual(p.tags.sort(), ["x", "y", "z"]);
  assert.deepEqual(p.links, ["Outra Nota", "Outra Nota"]);
  assert.deepEqual(p.mentions, ["Fulano", "Nome Composto"]);
});

ok("heading '# Titulo' não vira tag", () => {
  assert.deepEqual(extractTags("# Título\n## Sub\ntexto #tag1"), ["tag1"]);
});

ok("setFrontmatterKey: cria, troca e remove", () => {
  let r = setFrontmatterKey("# Oi\n", "area", "X > Y");
  assert.match(r, /^---\narea: X > Y\n---\n/);
  r = setFrontmatterKey(r, "area", "Z");
  assert.match(r, /area: Z/);
  assert.ok(!/X > Y/.test(r));
  r = setFrontmatterKey(r, "tags", ["a", "b"]);
  assert.match(r, /tags: \[a, b\]/);
  r = setFrontmatterKey(r, "area", "");
  assert.ok(!/area:/.test(r));
  assert.match(r, /# Oi/);
});

ok("seed: cria notas de exemplo na primeira leitura", () => {
  const notes = store.loadNotes();
  assert.ok(notes.length >= 5, `esperava >=5, veio ${notes.length}`);
});

ok("grafo: nós, arestas, áreas em hierarquia, fantasmas", () => {
  const g = buildGraph();
  assert.ok(g.nodes.length >= 5);
  assert.ok(g.edges.length > 5);
  const win = g.nodes.find((x) => x.title === "Windows");
  assert.ok(win, "nó Windows");
  assert.deepEqual(win.areaPath, ["computacao", "computacao/sistemas-operacionais", "computacao/sistemas-operacionais/windows"]);
  const ids = g.areas.map((a) => a.id);
  assert.ok(ids.includes("computacao") && ids.includes("computacao/sistemas-operacionais/windows"));
  const comp = g.areas.find((a) => a.id === "computacao");
  assert.ok(comp.count >= 4, "contagem herdada pela área pai");
  assert.ok(g.tags.find((t) => t.tag === "exemplo"));
});

ok("relações: backlinks de Linux", () => {
  const r = relationsFor("Computação/Linux.md");
  const from = r.backlinks.map((b) => b.title);
  assert.ok(from.includes("Sistemas Operacionais") || from.includes("Windows"), JSON.stringify(from));
});

ok("escrever + ler + link fantasma", () => {
  store.writeNote("Teste/Nova.md", "# Nova\nVeja [[Inexistente]] e [[Linux]]");
  const g = buildGraph();
  assert.ok(g.ghosts.find((x) => x.title === "Inexistente"));
  assert.equal(store.readNote("Teste/Nova.md").meta.title, "Nova");
});

ok("criar duplicada -> 409", () => {
  assert.throws(() => store.writeNote("Teste/Nova.md", "x", { create: true }), (e) => e.status === 409);
});

ok("caminho inseguro bloqueado", () => {
  for (const bad of ["../fora.md", "a/../../x.md", ".meta/areas.json", "a//b.md", ".oculto.md", "a/b:c.md"]) {
    assert.throws(() => store.writeNote(bad, "x"), (e) => e.status === 400, bad);
  }
  // caminho absoluto é reinterpretado como relativo ao cofre (nunca escapa dele)
  const r = store.writeNote("/etc/passwd", "x");
  assert.equal(r.path, "etc/passwd.md");
  assert.ok(fs.existsSync(path.join(tmp, "etc", "passwd.md")));
});

ok("busca no conteúdo", () => {
  const r = store.searchNotes("servidores");
  assert.ok(r.length >= 1);
});

ok("renomear atualiza [[links]]", () => {
  const res = store.renameNote("Computação/Linux.md", "Computação/Linux Debian.md");
  assert.ok(res.updatedLinks >= 1);
  const so = store.readNote("Computação/Sistemas Operacionais.md").raw;
  assert.match(so, /\[\[Linux Debian\]\]/);
});

ok("apagar vai para a lixeira (recuperável)", () => {
  store.deleteNote("Teste/Nova.md");
  assert.ok(fs.readdirSync(path.join(tmp, ".meta", "lixeira")).length === 1);
});

ok("visões: padrão, saneamento e regras", () => {
  const v = store.readViews();
  assert.ok(v.views.length >= 4);
  const s = views.sanitizeView({ id: "x y!", name: "T", layout: "nope", group: "area", rules: [{ when: { tag: "#Back" }, set: { color: "#ff0000", shape: "star", icon: "server", evil: "<script>" } }, { when: {}, set: { color: "bad" } }] });
  assert.equal(s.id, "xy");
  assert.equal(s.layout, "fcose");
  assert.equal(s.rules.length, 1);
  assert.deepEqual(s.rules[0], { when: { tag: "back" }, set: { color: "#ff0000", shape: "star", icon: "server" } });
  store.writeViews({ views: [s], activeId: "xy" });
  assert.equal(store.readViews().activeId, "xy");
});

ok("áreas: sanitize remove pais inexistentes e cores inválidas", () => {
  const a = store.sanitizeAreas([{ id: "a", name: "A", parent: "zzz", color: "red" }, { id: "a" }]);
  assert.equal(a.length, 1);
  assert.equal(a[0].parent, null);
  assert.equal(a[0].color, "#5e6c84");
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n} testes passaram`);
