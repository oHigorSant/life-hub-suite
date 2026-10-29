"use client";

import { useEffect, useState } from "react";
import { Play, Pause, RotateCcw, SkipForward, Flag, Settings2, Plus, X } from "lucide-react";
import { usePomodoro, useStopwatch, useCountdown } from "./timeEngine.js";
import { fmtDuration, todayYmd, addDays, fmtShort } from "./dates.js";

const MODE_LABEL = { focus: "Foco", short: "Pausa curta", long: "Pausa longa" };

function Ring({ value, size = 220, stroke = 10, color = "var(--accent)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ag-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--list-bg-hover)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(1, value)) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ag-ring-in">{children}</div>
    </div>
  );
}

export function PomodoroPanel({ log = [], onLogged }) {
  const p = usePomodoro();
  const [cfgOpen, setCfgOpen] = useState(false);
  const [draft, setDraft] = useState(p.cfg);
  useEffect(() => setDraft(p.cfg), [p.cfg]);
  const color = p.state.mode === "focus" ? "var(--accent)" : "#1f845a";
  const progress = p.total > 0 ? 1 - p.remainingSec / p.total : 0;
  const today = todayYmd();
  const todayFocus = log.filter((l) => l.kind === "focus" && l.date === today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((d) => ({ d, min: log.filter((l) => l.kind === "focus" && l.date === d).reduce((s, l) => s + l.minutes, 0) }));
  const maxMin = Math.max(30, ...week.map((w) => w.min));

  return (
    <div className="ag-tool">
      <div className="ag-seg">
        {["focus", "short", "long"].map((m) => (
          <button key={m} type="button" className={p.state.mode === m ? "on" : ""} onClick={() => p.setMode(m)}>{MODE_LABEL[m]}</button>
        ))}
      </div>
      <Ring value={progress} color={color}>
        <div className="ag-big">{fmtDuration(p.remainingSec)}</div>
        <div className="ag-sub">{MODE_LABEL[p.state.mode]} · ciclo {p.state.cycle}/{p.cfg.cycles}</div>
      </Ring>
      <input className="ag-label" value={p.state.label} onChange={(e) => p.setLabel(e.target.value)} placeholder="No que você vai focar? (opcional)" maxLength={120} />
      <div className="ag-controls">
        {p.state.running
          ? <button type="button" className="ag-btn primary" onClick={p.pause}><Pause size={16} /> Pausar</button>
          : <button type="button" className="ag-btn primary" onClick={p.start}><Play size={16} /> {p.remainingSec < p.total ? "Continuar" : "Iniciar"}</button>}
        <button type="button" className="ag-btn" onClick={p.reset}><RotateCcw size={15} /> Reiniciar</button>
        <button type="button" className="ag-btn" onClick={p.skip}><SkipForward size={15} /> Pular</button>
        <button type="button" className="ag-btn" onClick={() => setCfgOpen((v) => !v)} aria-label="Configurar"><Settings2 size={15} /></button>
      </div>
      {cfgOpen && (
        <div className="ag-cfg">
          {[["focus", "Foco (min)"], ["short", "Pausa curta"], ["long", "Pausa longa"], ["cycles", "Ciclos até a longa"]].map(([k, l]) => (
            <label key={k}>{l}<input type="number" min="1" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} /></label>
          ))}
          <label className="ag-check"><input type="checkbox" checked={!!draft.autoStart} onChange={(e) => setDraft({ ...draft, autoStart: e.target.checked })} /> Iniciar o próximo automaticamente</label>
          <button type="button" className="ag-btn primary" onClick={async () => { await p.saveCfg(draft); setCfgOpen(false); onLogged?.(); }}>Salvar</button>
        </div>
      )}
      <div className="ag-stats">
        <div><strong>{todayFocus.length}</strong><span>pomodoros hoje</span></div>
        <div><strong>{todayFocus.reduce((s, l) => s + l.minutes, 0)} min</strong><span>de foco hoje</span></div>
      </div>
      <div className="ag-week">
        {week.map((w) => (
          <div key={w.d} className="ag-weekcol" title={`${fmtShort(w.d)}: ${w.min} min`}>
            <i style={{ height: `${(w.min / maxMin) * 100}%` }} />
            <span>{fmtShort(w.d).slice(0, 3)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StopwatchPanel() {
  const s = useStopwatch();
  const ms = s.elapsedMs;
  const cs = Math.floor((ms % 1000) / 10);
  return (
    <div className="ag-tool">
      <div className="ag-big mono">{fmtDuration(ms / 1000)}<small>.{String(cs).padStart(2, "0")}</small></div>
      <div className="ag-controls">
        {s.sw.running
          ? <button type="button" className="ag-btn primary" onClick={s.pause}><Pause size={16} /> Pausar</button>
          : <button type="button" className="ag-btn primary" onClick={s.start}><Play size={16} /> {ms > 0 ? "Continuar" : "Iniciar"}</button>}
        <button type="button" className="ag-btn" onClick={s.lap} disabled={ms === 0}><Flag size={15} /> Volta</button>
        <button type="button" className="ag-btn" onClick={s.reset} disabled={ms === 0 && !s.sw.laps.length}><RotateCcw size={15} /> Zerar</button>
      </div>
      {s.sw.laps.length > 0 && (
        <ol className="ag-laps">
          {s.sw.laps.map((t, i) => {
            const prev = i ? s.sw.laps[i - 1] : 0;
            return <li key={i}><span>Volta {i + 1}</span><span>{fmtDuration((t - prev) / 1000)}</span><em>{fmtDuration(t / 1000)}</em></li>;
          }).reverse()}
        </ol>
      )}
    </div>
  );
}

const PRESETS = [1, 5, 10, 15, 25, 30, 45, 60];

export function TimerPanel() {
  const c = useCountdown();
  const [custom, setCustom] = useState("");
  const progress = c.t.total > 0 ? 1 - c.remainingSec / c.t.total : 0;
  return (
    <div className="ag-tool">
      <div className="ag-chips">
        {PRESETS.map((m) => <button key={m} type="button" className={`ag-chip${c.t.total === m * 60 ? " on" : ""}`} onClick={() => c.set(m * 60)}>{m} min</button>)}
        <form onSubmit={(e) => { e.preventDefault(); const v = Number(custom); if (v > 0) { c.set(Math.round(v * 60)); setCustom(""); } }}>
          <input className="ag-mini" type="number" min="1" step="1" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="outro (min)" />
        </form>
      </div>
      <Ring value={progress} color={c.t.done ? "#c9372c" : "var(--accent)"}>
        <div className="ag-big">{fmtDuration(c.remainingSec)}</div>
        <div className="ag-sub">{c.t.done ? "Tempo esgotado" : `de ${fmtDuration(c.t.total)}`}</div>
      </Ring>
      <div className="ag-controls">
        {c.t.running
          ? <button type="button" className="ag-btn primary" onClick={c.pause}><Pause size={16} /> Pausar</button>
          : <button type="button" className="ag-btn primary" onClick={c.start}><Play size={16} /> Iniciar</button>}
        <button type="button" className="ag-btn" onClick={c.reset}><RotateCcw size={15} /> Reiniciar</button>
      </div>
    </div>
  );
}

export function ClockPanel({ zones: initial = [], onSaveZones }) {
  const [now, setNow] = useState(() => new Date());
  const [zones, setZones] = useState(initial);
  const [adding, setAdding] = useState("");
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => setZones(initial), [initial.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = (tz, opts) => { try { return new Intl.DateTimeFormat("pt-BR", { timeZone: tz, ...opts }).format(now); } catch { return "—"; } };
  const valid = (tz) => { try { new Intl.DateTimeFormat("pt-BR", { timeZone: tz }); return true; } catch { return false; } };
  async function save(next) { setZones(next); await onSaveZones?.(next); }
  return (
    <div className="ag-tool">
      <div className="ag-big mono">{fmt(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
      <div className="ag-sub cap">{fmt(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div className="ag-zones">
        {zones.map((z) => (
          <div key={z} className="ag-zone">
            <div><strong>{z.split("/").pop().replace(/_/g, " ")}</strong><span>{fmt(z, { weekday: "short", day: "2-digit", month: "2-digit" })}</span></div>
            <em>{fmt(z, { hour: "2-digit", minute: "2-digit" })}</em>
            <button type="button" className="ag-x" onClick={() => save(zones.filter((x) => x !== z))} aria-label="Remover"><X size={13} /></button>
          </div>
        ))}
      </div>
      <form className="ag-addzone" onSubmit={(e) => { e.preventDefault(); const tz = adding.trim(); if (tz && valid(tz) && !zones.includes(tz)) { save([...zones, tz].slice(0, 8)); setAdding(""); } }}>
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Adicionar fuso, ex.: Asia/Tokyo" list="ag-tzs" />
        <datalist id="ag-tzs">{["America/Sao_Paulo", "America/New_York", "America/Los_Angeles", "Europe/London", "Europe/Lisbon", "Europe/Paris", "Asia/Tokyo", "Asia/Dubai", "Australia/Sydney", "UTC"].map((z) => <option key={z} value={z} />)}</datalist>
        <button type="submit" className="ag-btn"><Plus size={14} /> Adicionar</button>
      </form>
    </div>
  );
}
