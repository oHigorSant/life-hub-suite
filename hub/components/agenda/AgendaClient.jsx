"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Repeat, ListChecks } from "lucide-react";
import { useLive } from "../live/liveClient.js";
import { addDays, expandRoutines, eventsOn, fmtLong, fmtMonth, fmtShort, todayYmd, weekDays, monthGrid, WEEKDAYS, COLOR_HEX } from "./dates.js";
import { DayView, WeekView, MonthView } from "./CalendarViews.jsx";
import { EventModal, RoutineModal } from "./AgendaModals.jsx";
import { PomodoroPanel, StopwatchPanel, TimerPanel, ClockPanel } from "./TimeTools.jsx";

async function api(url, opts = {}) {
  const r = await fetch(url, { cache: "no-store", ...opts, headers: opts.body ? { "content-type": "application/json" } : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}
const post = (op, payload) => api("/api/agenda", { method: "POST", body: JSON.stringify({ op, ...payload }) });

const VIEWS = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["rotina", "Rotina"], ["tempo", "Tempo"]];
const TOOLS = [["pomodoro", "Pomodoro"], ["timer", "Timer"], ["cronometro", "Cronômetro"], ["relogio", "Relógio"]];

export default function AgendaClient() {
  const [view, setView] = useState("dia");
  const [tool, setTool] = useState("pomodoro");
  const [day, setDay] = useState(todayYmd());
  const [data, setData] = useState(null);
  const [cards, setCards] = useState([]);
  const [error, setError] = useState("");
  const [evModal, setEvModal] = useState(null);
  const [rtModal, setRtModal] = useState(null);

  // a aba pode vir da URL (?v=tempo, usada pelo agente e pelos atalhos); senão lembra a última
  const sp = useSearchParams();
  useEffect(() => {
    const q = sp.get("v");
    if (q && VIEWS.some((x) => x[0] === q)) { setView(q); return; }
    try { const v = localStorage.getItem("lh-agenda-view"); if (v && VIEWS.some((x) => x[0] === v)) setView(v); } catch {}
  }, [sp]);
  useEffect(() => { const q = sp.get("t"); if (q && TOOLS.some((x) => x[0] === q)) setTool(q); }, [sp]);
  const changeView = (v) => { setView(v); try { localStorage.setItem("lh-agenda-view", v); } catch {} };

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([api("/api/agenda"), api("/api/tasks").catch(() => ({ cards: [] }))]);
    setData(a);
    setCards((t.cards || []).filter((c) => !c.archived && c.dueDate));
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  // qualquer mudança (pelo agente, outra aba, tarefas com prazo) aparece sozinha
  useLive(["agenda", "tasks"], () => { load().catch(() => {}); });

  // todos os itens de um dia: eventos + rotinas + tarefas com prazo
  const itemsFor = useCallback((d) => {
    if (!data) return [];
    const ev = eventsOn(data.events, d).map((e) => ({ ...e, key: e.id, kind: "event", ref: e, allDay: e.allDay }));
    const rt = expandRoutines(data.routines, d, d).map((r) => ({ ...r, ref: data.routines.find((x) => x.id === r.routineId) }));
    const tk = cards.filter((c) => c.dueDate === d).map((c) => ({ key: `task:${c.id}`, kind: "task", title: c.title, date: d, allDay: true, color: c.done ? "grey" : "orange", done: c.done, ref: c }));
    return [...ev, ...rt, ...tk];
  }, [data, cards]);

  function openItem(it) {
    if (it.kind === "event") setEvModal(it.ref);
    else if (it.kind === "routine") setRtModal(it.ref);
    else window.location.assign("/tarefas");
  }
  const createAt = (d, startTime) => setEvModal({ date: d, startTime, endTime: startTime && startTime < "23:00" ? `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:${startTime.slice(3)}` : "23:59" });

  async function saveEvent(e) { await post("upsertEvent", { event: e }); setEvModal(null); await load(); }
  async function removeEvent(e) { if (!confirm(`Excluir "${e.title}"?`)) return; await post("deleteEvent", { id: e.id }); setEvModal(null); await load(); }
  async function saveRoutine(r) { await post("upsertRoutine", { routine: r }); setRtModal(null); await load(); }
  async function removeRoutine(r) { if (!confirm(`Excluir a rotina "${r.title}"?`)) return; await post("deleteRoutine", { id: r.id }); setRtModal(null); await load(); }

  const step = view === "mes" ? 0 : view === "semana" ? 7 : 1;
  function move(dir) {
    if (view === "mes") {
      const d = new Date(day + "T12:00:00");
      d.setMonth(d.getMonth() + dir, 1);
      setDay(d.toLocaleDateString("sv-SE"));
    } else setDay(addDays(day, dir * step));
  }
  const title = view === "dia" ? fmtLong(day) : view === "semana" ? `${fmtShort(weekDays(day)[0])} a ${fmtShort(weekDays(day)[6])}` : view === "mes" ? fmtMonth(day) : view === "rotina" ? "Rotina semanal" : "Ferramentas de tempo";
  const showNav = ["dia", "semana", "mes"].includes(view);

  const dayTasks = useMemo(() => cards.filter((c) => c.dueDate === day), [cards, day]);
  const overdue = useMemo(() => cards.filter((c) => !c.done && c.dueDate < todayYmd()), [cards]);

  if (error) return <div className="ag-root"><p className="ag-err" style={{ padding: 20 }}>{error}</p></div>;
  if (!data) return <div className="ag-root"><p className="ag-muted" style={{ padding: 20 }}>Carregando agenda…</p></div>;

  return (
    <div className="ag-root">
      <header className="ag-head">
        <div className="ag-tabs" role="tablist">
          {VIEWS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => changeView(k)}>{l}</button>)}
        </div>
        {showNav && (
          <div className="ag-nav">
            <button type="button" className="ag-btn" onClick={() => move(-1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
            <button type="button" className="ag-btn" onClick={() => setDay(todayYmd())}>Hoje</button>
            <button type="button" className="ag-btn" onClick={() => move(1)} aria-label="Próximo"><ChevronRight size={16} /></button>
          </div>
        )}
        <h2 className="ag-title">{title}</h2>
        <span className="grow" />
        {view === "rotina"
          ? <button type="button" className="ag-btn primary" onClick={() => setRtModal({})}><Plus size={15} /> Nova rotina</button>
          : showNav && <button type="button" className="ag-btn primary" onClick={() => createAt(day, "09:00")}><Plus size={15} /> Evento</button>}
      </header>

      <div className="ag-body">
        {view === "dia" && (
          <div className="ag-daylayout">
            <DayView day={day} itemsFor={itemsFor} onCreate={createAt} onOpen={openItem} />
            <aside className="ag-side">
              <h4><ListChecks size={14} /> Tarefas do dia</h4>
              {dayTasks.length === 0 && <p className="ag-muted">Nenhuma tarefa com prazo neste dia.</p>}
              {dayTasks.map((c) => <Link key={c.id} href="/tarefas" className={`ag-task${c.done ? " done" : ""}`}>{c.title}</Link>)}
              {overdue.length > 0 && (
                <>
                  <h4 className="warn">Atrasadas ({overdue.length})</h4>
                  {overdue.slice(0, 6).map((c) => <Link key={c.id} href="/tarefas" className="ag-task late"><span>{c.title}</span><em>{c.dueDate.slice(8)}/{c.dueDate.slice(5, 7)}</em></Link>)}
                </>
              )}
              <h4><Repeat size={14} /> Rotina de hoje</h4>
              {expandRoutines(data.routines, day, day).length === 0 && <p className="ag-muted">Sem rotina neste dia.</p>}
              {expandRoutines(data.routines, day, day).map((r) => <button key={r.key} type="button" className="ag-task routine" style={{ "--c": COLOR_HEX[r.color] }} onClick={() => setRtModal(data.routines.find((x) => x.id === r.routineId))}><span>{r.title}</span><em>{r.startTime}</em></button>)}
            </aside>
          </div>
        )}
        {view === "semana" && <WeekView day={day} itemsFor={itemsFor} onCreate={createAt} onOpen={openItem} onPickDay={(d) => { setDay(d); changeView("dia"); }} />}
        {view === "mes" && <MonthView day={day} itemsFor={itemsFor} onOpen={openItem} onPickDay={(d) => { setDay(d); changeView("dia"); }} />}

        {view === "rotina" && (
          <div className="ag-routines">
            {data.routines.length === 0 && <p className="ag-muted">Nenhuma rotina ainda. Rotinas são hábitos fixos da semana (academia, estudo, revisão) que aparecem sozinhos no calendário.</p>}
            {data.routines.map((r) => (
              <button key={r.id} type="button" className={`ag-routine${r.active ? "" : " off"}`} style={{ "--c": COLOR_HEX[r.color] }} onClick={() => setRtModal(r)}>
                <span className="dot" />
                <div><strong>{r.title}</strong><span>{r.time} · {r.duration} min</span></div>
                <div className="ag-daypills">{[1, 2, 3, 4, 5, 6, 0].map((d) => <i key={d} className={r.days.includes(d) ? "on" : ""}>{WEEKDAYS[d][0]}</i>)}</div>
              </button>
            ))}
          </div>
        )}

        {view === "tempo" && (
          <div className="ag-timewrap">
            <div className="ag-seg center">
              {TOOLS.map(([k, l]) => <button key={k} type="button" className={tool === k ? "on" : ""} onClick={() => setTool(k)}>{l}</button>)}
            </div>
            {tool === "pomodoro" && <PomodoroPanel log={data.pomodoro.log} onLogged={load} />}
            {tool === "timer" && <TimerPanel />}
            {tool === "cronometro" && <StopwatchPanel />}
            {tool === "relogio" && <ClockPanel zones={data.settings.worldClocks} onSaveZones={async (z) => { await post("saveSettings", { settings: { worldClocks: z } }); await load(); }} />}
          </div>
        )}
      </div>

      {evModal && <EventModal initial={evModal} onSave={saveEvent} onDelete={removeEvent} onClose={() => setEvModal(null)} />}
      {rtModal && <RoutineModal initial={rtModal} onSave={saveRoutine} onDelete={removeRoutine} onClose={() => setRtModal(null)} />}
    </div>
  );
}
