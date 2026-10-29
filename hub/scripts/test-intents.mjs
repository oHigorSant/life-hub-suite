import assert from "node:assert/strict";
import { parseIntent, parseDuration, humanDuration, replyFor } from "../lib/intents/parse.js";

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log("ok  -", name); };
const T = (text, exp) => ok(`"${text}"`, () => {
  const got = parseIntent(text);
  if (exp === null) return assert.equal(got, null, JSON.stringify(got));
  assert.ok(got, "esperava um comando, veio null");
  for (const [k, v] of Object.entries(exp)) assert.deepEqual(got[k], v, `${k}: ${JSON.stringify(got)}`);
});

// durações
ok("duração: formatos", () => {
  assert.equal(parseDuration("30min"), 1800);
  assert.equal(parseDuration("30 minutos"), 1800);
  assert.equal(parseDuration("1h30"), 5400);
  assert.equal(parseDuration("1 h 30 min"), 5400);
  assert.equal(parseDuration("uma hora e meia"), 5400);
  assert.equal(parseDuration("meia hora"), 1800);
  assert.equal(parseDuration("duas horas"), 7200);
  assert.equal(parseDuration("vinte e cinco minutos"), 1500);
  assert.equal(parseDuration("90 segundos"), 90);
  assert.equal(parseDuration("1,5 horas"), 5400);
  assert.equal(parseDuration("2 horas e 15 minutos"), 8100);
  assert.equal(parseDuration("sem tempo nenhum"), null);
  assert.equal(parseDuration("48 horas"), null);
});
ok("humanDuration", () => {
  assert.equal(humanDuration(1800), "30 min");
  assert.equal(humanDuration(5400), "1 h 30 min");
  assert.equal(humanDuration(45), "45 s");
});

// timer
T("temporizador de 30min", { type: "time", kind: "timer", action: "start", seconds: 1800 });
T(" temporizador de 30min", { kind: "timer", seconds: 1800 });
T("Temporizador de 30 minutos", { kind: "timer", seconds: 1800 });
T("timer 5 min", { kind: "timer", seconds: 300 });
T("coloca um timer de dez minutos", { kind: "timer", seconds: 600 });
T("me avisa em 20 minutos", { kind: "timer", seconds: 1200 });
T("crie um temporizador de 1h30", { kind: "timer", seconds: 5400 });
T("cronômetro de 15 minutos", { kind: "timer", seconds: 900 });
T("alarme em meia hora", { kind: "timer", seconds: 1800 });
T("temporizador de 25 minutos para estudar SQL", { kind: "timer", seconds: 1500, label: "estudar sql" });
T("30 minutos", { kind: "timer", action: "start", seconds: 1800 });
T("em 45 minutos", { kind: "timer", seconds: 2700 });
T("pausar o temporizador", { kind: "timer", action: "pause" });
T("cancelar timer", { kind: "timer", action: "reset" });
T("parar o temporizador", { kind: "timer", action: "reset" });
T("retomar o timer", { kind: "timer", action: "resume" });

// pomodoro
T("pomodoro", { kind: "pomo", action: "start" });
T("iniciar pomodoro", { kind: "pomo", action: "start" });
T("começar um pomodoro para estudar inglês", { kind: "pomo", action: "start", label: "estudar ingles" });
T("pausar pomodoro", { kind: "pomo", action: "pause" });
T("parar o pomodoro", { kind: "pomo", action: "pause" });
T("zerar o pomodoro", { kind: "pomo", action: "reset" });
T("pular pomodoro", { kind: "pomo", action: "skip" });
T("pausa curta pomodoro", { kind: "pomo", action: "start", mode: "short" });

// cronômetro
T("cronômetro", { kind: "stopwatch", action: "start" });
T("iniciar cronometro", { kind: "stopwatch", action: "start" });
T("parar cronômetro", { kind: "stopwatch", action: "pause" });
T("zerar o cronômetro", { kind: "stopwatch", action: "reset" });
T("marcar volta no cronômetro", { kind: "stopwatch", action: "lap" });

// navegação
T("abrir finanças", { type: "navigate", to: "/financas" });
T("abre a aba de tarefas", { type: "navigate", to: "/tarefas" });
T("ir para estudos", { type: "navigate", to: "/estudos" });
T("mostre o grafo", { type: "navigate", to: "/notas/grafo" });
T("abrir notas", { type: "navigate", to: "/notas" });
T("me leva para a agenda", { type: "navigate", to: "/agenda" });
T("abrir quadros", { type: "navigate", to: "/quadros" });
T("abrir o relógio", { type: "navigate", to: "/agenda?v=tempo&t=relogio" });
T("abrir o temporizador", { type: "navigate", to: "/agenda?v=tempo&t=timer" });
T("mostre o cronômetro", { type: "navigate", to: "/agenda?v=tempo&t=cronometro" });
T("ir para o pomodoro", { type: "navigate", to: "/agenda?v=tempo&t=pomodoro" });
T("ir para o início", { type: "navigate", to: "/" });

// NÃO são comandos rápidos (vão para o agente)
T("gastei 40 reais no mercado", null);
T("preciso fazer uma lista: comprar leite, ligar pro dentista", null);
T("organize tudo sobre back-end", null);
T("abrir a nota sobre windows e resumir", null);
T("o que eu tenho pra fazer hoje?", null);
T("pomodoro de 50 minutos para o relatório", null);
T("lembrar de pagar a conta de luz amanhã às 10h", null);
T("tarefa: estudar 30 minutos de SQL todo dia", null);

ok("replyFor", () => {
  assert.equal(replyFor(parseIntent("temporizador de 30min")), "Temporizador de 30 min iniciado.");
  assert.equal(replyFor(parseIntent("abrir finanças")), "Abrindo Finanças.");
});

console.log(`\n${n} testes passaram`);
