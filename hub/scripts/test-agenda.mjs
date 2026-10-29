import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agenda-test-"));
process.env.AGENDA_FILE = path.join(tmp, "agenda.json");
const s = await import("../lib/agenda/store.js");
const d = await import("../components/agenda/dates.js");

let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log("ok  -", name); };

await ok("evento: cria, valida horário e fim padrão (+60min)", async () => {
  const e = await s.upsertEvent({ title: "Dentista", date: "2026-10-21", startTime: "09:30" });
  assert.equal(e.endTime, "10:30");
  assert.equal(e.color, "blue");
  await assert.rejects(() => s.upsertEvent({ title: "x", date: "21/10/2026", startTime: "09:00" }), (x) => x.status === 400);
  await assert.rejects(() => s.upsertEvent({ title: "x", date: "2026-10-21", startTime: "25:00" }), (x) => x.status === 400);
});

await ok("evento: dia todo não exige horário; endDate só se >= date", async () => {
  const e = await s.upsertEvent({ title: "Viagem", date: "2026-11-01", allDay: true, endDate: "2026-11-03" });
  assert.equal(e.endDate, "2026-11-03");
  const e2 = await s.upsertEvent({ title: "Viagem2", date: "2026-11-05", allDay: true, endDate: "2026-11-01" });
  assert.equal(e2.endDate, undefined);
});

await ok("atualizar e apagar evento", async () => {
  const [first] = s.readAgenda().events;
  await s.upsertEvent({ ...first, title: "Dentista (remarcado)", date: "2026-10-22" });
  assert.equal(s.readAgenda().events.find((x) => x.id === first.id).date, "2026-10-22");
  await s.deleteEvent(first.id);
  await assert.rejects(() => s.deleteEvent(first.id), (x) => x.status === 404);
});

await ok("rotina: dias, duração mínima e expansão por intervalo", async () => {
  const r = await s.upsertRoutine({ title: "Academia", time: "07:00", days: [1, 3, 5], duration: 1 });
  assert.equal(r.duration, 5);
  const inst = d.expandRoutines(s.readAgenda().routines, "2026-10-19", "2026-10-25");
  assert.deepEqual(inst.map((x) => x.date), ["2026-10-19", "2026-10-21", "2026-10-23"]);
  assert.equal(inst[0].endTime, "07:05");
});

await ok("rotina inativa não gera instâncias", async () => {
  const [r] = s.readAgenda().routines;
  await s.upsertRoutine({ ...r, active: false });
  assert.equal(d.expandRoutines(s.readAgenda().routines, "2026-10-19", "2026-10-25").length, 0);
});

await ok("pomodoro: registra sessão e salva configuração limitada", async () => {
  const p = await s.logPomodoro({ minutes: 25, label: "Estudar SQL" });
  assert.equal(p.kind, "focus");
  await assert.rejects(() => s.logPomodoro({ minutes: 0 }), (x) => x.status === 400);
  const cfg = await s.savePomodoroSettings({ focus: 9999, short: 0, cycles: 3, autoStart: 1 });
  assert.equal(cfg.focus, 180);
  assert.equal(cfg.short, 5);
  assert.equal(cfg.cycles, 3);
  assert.equal(s.readAgenda().pomodoro.log.length, 1);
});

await ok("escritas simultâneas não se perdem", async () => {
  await Promise.all(Array.from({ length: 25 }, (_, i) => s.upsertEvent({ title: `E${i}`, date: "2026-12-01", startTime: "10:00" })));
  assert.equal(s.readAgenda().events.filter((e) => e.date === "2026-12-01").length, 25);
});

await ok("fusos do relógio mundial validados", async () => {
  const st = await s.saveSettings({ worldClocks: ["Asia/Tokyo", "isto não é fuso", "../../etc"] });
  assert.deepEqual(st.worldClocks, ["Asia/Tokyo"]);
});

await ok("datas: semana começa na segunda; grade do mês tem 42 dias", () => {
  assert.equal(d.startOfWeek("2026-10-21"), "2026-10-19");
  assert.equal(d.startOfWeek("2026-10-18"), "2026-10-12");
  assert.equal(d.monthGrid("2026-10-15").length, 42);
  assert.equal(d.monthGrid("2026-10-15")[0], "2026-09-28");
  assert.equal(d.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(d.fmtDuration(3725), "1:02:05");
  assert.equal(d.eventsOn([{ date: "2026-11-01", endDate: "2026-11-03" }], "2026-11-02").length, 1);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n} testes passaram`);
