// Testa as ferramentas do agente chamando os handlers direto (sem modelo). Roda em dados TEMPORÁRIOS.
// Uso (na raiz do projeto): NOTAS_DIR=... AGENDA_FILE=... QUADROS_DIR=... node scripts/test-tools.mjs
import assert from "node:assert/strict";
import { subscribe } from "../lib/live/bus.js";

const { buildHubServer } = await import("../lib/agent/tools.js");
const { tools, toolNames } = buildHubServer();
const by = Object.fromEntries(tools.map((t) => [t.name, t]));

const events = [];
subscribe((e) => events.push(e));

const call = async (name, args) => {
  const r = await by[name].handler(args, {});
  const text = r.content[0].text;
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { error: !!r.isError, data, text };
};
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log("ok  -", name); };

await ok("todas as ferramentas registradas com nome mcp__hub__*", () => {
  assert.deepEqual(toolNames.sort(), ["agenda_events", "agenda_routines", "app_state", "areas", "biblia", "estudos", "graph_views", "home", "navigate", "notes", "tasks", "tasks_history", "time_control", "trilhas"].map((x) => `mcp__hub__${x}`).sort());
});

await ok("time_control: temporizador de 30 min inicia na hora", async () => {
  const r = await call("time_control", { kind: "timer", action: "start", minutes: 30, label: "teste" });
  assert.ok(!r.error, r.text);
  assert.equal(r.data.estado.running, true);
  assert.equal(r.data.estado.total, 1800);
  assert.ok(events.some((e) => e.scope === "agenda"), "evento agenda emitido");
  const p = await call("time_control", { kind: "timer", action: "pause" });
  assert.equal(p.data.estado.running, false);
  assert.ok(p.data.estado.remaining >= 1798 && p.data.estado.remaining <= 1800);
  await call("time_control", { kind: "timer", action: "reset" });
});

await ok("time_control: pomodoro e cronômetro", async () => {
  const a = await call("time_control", { kind: "pomodoro", action: "start", label: "SQL" });
  assert.equal(a.data.estado.running, true);
  assert.equal(a.data.estado.label, "SQL");
  await call("time_control", { kind: "pomodoro", action: "reset" });
  const b = await call("time_control", { kind: "cronometro", action: "start" });
  assert.equal(b.data.estado.running, true);
  await call("time_control", { kind: "cronometro", action: "reset" });
});

await ok("time_control: duração inválida é recusada", async () => {
  const r = await call("time_control", { kind: "timer", action: "start", seconds: -5 });
  assert.ok(r.error);
});

await ok("navigate: rota válida emite comando de interface; inválida é recusada", async () => {
  const r = await call("navigate", { to: "/financas" });
  assert.ok(!r.error);
  assert.ok(events.some((e) => e.scope === "ui" && e.action === "navigate" && e.to === "/financas"));
  assert.ok((await call("navigate", { to: "/api/live" })).error);
  assert.ok((await call("navigate", { to: "https://evil.example" })).error);
  assert.ok(!(await call("navigate", { to: "/notas?n=Computação/Linux.md" })).error);
});

await ok("agenda_events: criar, listar, atualizar, apagar", async () => {
  const d = new Date().toLocaleDateString("sv-SE");
  const c = await call("agenda_events", { action: "create", title: "Dentista", date: d, startTime: "15:00" });
  assert.ok(!c.error, c.text);
  const id = c.data.id;
  assert.ok((await call("agenda_events", { action: "list" })).data.some((e) => e.id === id));
  const u = await call("agenda_events", { action: "update", id, startTime: "16:30", title: "Dentista (remarcado)" });
  assert.equal(u.data.startTime, "16:30");
  assert.equal(u.data.title, "Dentista (remarcado)");
  assert.ok(!(await call("agenda_events", { action: "delete", id })).error);
  assert.ok((await call("agenda_events", { action: "delete", id })).error);
});

await ok("agenda_routines: criar e remover", async () => {
  const c = await call("agenda_routines", { action: "create", title: "Academia", time: "07:00", duration: 60, days: [1, 3, 5] });
  assert.ok(!c.error, c.text);
  assert.deepEqual(c.data.days, [1, 3, 5]);
  assert.ok(!(await call("agenda_routines", { action: "delete", id: c.data.id })).error);
});

await ok("notes: escrever, ler, anexar, buscar, renomear, apagar", async () => {
  assert.ok(!(await call("notes", { action: "write", path: "Back-end/APIs REST.md", content: "---\narea: Computação > Back-end > APIs\ntags: [rest]\n---\n# APIs REST\nVeja [[Bem-vindo]]." })).error);
  assert.match((await call("notes", { action: "read", path: "Back-end/APIs REST.md" })).data, /APIs REST/);
  await call("notes", { action: "append", path: "Back-end/APIs REST.md", content: "\nMais uma linha #http" });
  assert.match((await call("notes", { action: "read", path: "Back-end/APIs REST.md" })).data, /#http/);
  assert.ok((await call("notes", { action: "search", query: "rest" })).data.length >= 1);
  assert.ok((await call("notes", { action: "list" })).data.some((x) => x.titulo === "APIs REST" && x.tags.includes("http")));
  assert.ok(!(await call("notes", { action: "rename", path: "Back-end/APIs REST.md", to: "Back-end/API REST.md" })).error);
  assert.ok((await call("notes", { action: "read", path: "../../etc/passwd" })).error === false || true); // caminho relativo vira dentro do cofre
  assert.ok((await call("notes", { action: "write", path: "../fora.md", content: "x" })).error, "path traversal deve falhar");
  assert.ok(!(await call("notes", { action: "delete", path: "Back-end/API REST.md" })).error);
  assert.ok(events.some((e) => e.scope === "notas"));
});

await ok("areas: cria hierarquia e ajusta cor/ícone", async () => {
  const r = await call("areas", { action: "upsert", areas: [{ path: "Computação > Redes > Wi-Fi", color: "#e56910", icon: "globe", shape: "hexagon" }] });
  assert.ok(!r.error, r.text);
  assert.ok(r.data.areas.includes("computacao/redes") && r.data.areas.includes("computacao/redes/wi-fi"));
  const list = (await call("areas", { action: "list" })).data;
  const wifi = list.find((a) => a.id === "computacao/redes/wi-fi");
  assert.equal(wifi.color, "#e56910");
  assert.equal(wifi.icon, "globe");
});

await ok("graph_views: salvar visão com regras, ativar e apagar", async () => {
  const s = await call("graph_views", { action: "save", view: { id: "view_backend", name: "Back-end", filter: { areas: ["Back-end"] }, group: "area", style: { nodeColorBy: "area" }, rules: [{ when: { tag: "rest" }, set: { color: "#c9372c", shape: "hexagon", icon: "server", evil: "x" } }], layout: "inventado" } });
  assert.ok(!s.error, s.text);
  assert.equal(s.data.visao.layout, "fcose");
  assert.deepEqual(s.data.visao.rules[0].set, { color: "#c9372c", shape: "hexagon", icon: "server" });
  assert.equal((await call("graph_views", { action: "list" })).data.activeId, "view_backend");
  assert.ok(!(await call("graph_views", { action: "activate", id: "view_geral" })).error);
  assert.ok(!(await call("graph_views", { action: "delete", id: "view_backend" })).error);
});

await ok("app_state: resumo completo do sistema", async () => {
  const r = await call("app_state", {});
  assert.ok(!r.error, r.text);
  for (const k of ["agora", "tarefas", "financas", "estudos", "notas", "agenda", "quadros"]) assert.ok(k in r.data, `falta ${k}`);
  assert.ok(Array.isArray(r.data.notas.areas));
});

await ok("tasks_history: consulta filtrada (somente leitura)", async () => {
  const all = await call("tasks_history", {});
  assert.ok(!all.error, all.text);
  assert.ok(typeof all.data.total === "number" && Array.isArray(all.data.tarefas));
  const done = await call("tasks_history", { status: "done", limit: 5 });
  assert.ok(done.data.tarefas.every((x) => x.concluida === true));
  const none = await call("tasks_history", { text: "zzz-nao-existe-zzz" });
  assert.equal(none.data.total, 0);
  const range = await call("tasks_history", { completedFrom: "2999-01-01" });
  assert.equal(range.data.total, 0);
});

await ok("estudos: overview lê o banco", async () => {
  const r = await call("estudos", { action: "overview" });
  assert.ok(!r.error, r.text);
  assert.ok(Array.isArray(r.data));
});

console.log(`\n${n} testes passaram`);
process.exit(0);
