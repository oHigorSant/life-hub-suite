"use client";

import { useState } from "react";
import { X, Trash2 } from "lucide-react";
import { COLOR_HEX, WEEKDAYS } from "./dates.js";

const COLOR_NAMES = { blue: "azul", green: "verde", red: "vermelho", orange: "laranja", purple: "roxo", teal: "turquesa", pink: "rosa", grey: "cinza" };

function ColorPick({ value, onChange }) {
  return (
    <div className="ag-colors" role="radiogroup" aria-label="Cor">
      {Object.keys(COLOR_HEX).map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={COLOR_NAMES[c]} className={value === c ? "on" : ""} style={{ background: COLOR_HEX[c] }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

function Shell({ title, onClose, children, footer }) {
  return (
    <div className="ag-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ag-modal-card" role="dialog" aria-label={title}>
        <div className="ag-modal-head"><strong>{title}</strong><button type="button" className="ag-x" onClick={onClose} aria-label="Fechar"><X size={16} /></button></div>
        <div className="ag-modal-body">{children}</div>
        <div className="ag-modal-foot">{footer}</div>
      </div>
    </div>
  );
}

export function EventModal({ initial, onSave, onDelete, onClose }) {
  const [e, setE] = useState({ title: "", date: "", startTime: "09:00", endTime: "10:00", allDay: false, color: "blue", notes: "", location: "", done: false, ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setE((x) => ({ ...x, [k]: v }));
  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    try { await onSave(e); } catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <Shell title={e.id ? "Editar evento" : "Novo evento"} onClose={onClose} footer={
      <>
        {e.id && <button type="button" className="ag-btn danger" onClick={() => onDelete(e)}><Trash2 size={14} /> Excluir</button>}
        <span className="grow" />
        <button type="button" className="ag-btn" onClick={onClose}>Cancelar</button>
        <button type="submit" form="ag-event-form" className="ag-btn primary" disabled={busy}>Salvar</button>
      </>
    }>
      <form id="ag-event-form" onSubmit={submit} className="ag-form">
        <label>Título<input autoFocus value={e.title} onChange={(x) => set("title", x.target.value)} placeholder="O que vai acontecer?" /></label>
        <div className="row">
          <label>Data<input type="date" value={e.date} onChange={(x) => set("date", x.target.value)} required /></label>
          <label className="check"><input type="checkbox" checked={e.allDay} onChange={(x) => set("allDay", x.target.checked)} /> Dia inteiro</label>
        </div>
        {e.allDay ? (
          <label>Até (opcional)<input type="date" value={e.endDate || ""} min={e.date} onChange={(x) => set("endDate", x.target.value)} /></label>
        ) : (
          <div className="row">
            <label>Início<input type="time" value={e.startTime} onChange={(x) => set("startTime", x.target.value)} required /></label>
            <label>Fim<input type="time" value={e.endTime} onChange={(x) => set("endTime", x.target.value)} /></label>
          </div>
        )}
        <label>Local<input value={e.location} onChange={(x) => set("location", x.target.value)} placeholder="opcional" /></label>
        <label>Cor<ColorPick value={e.color} onChange={(c) => set("color", c)} /></label>
        <label>Notas<textarea rows={3} value={e.notes} onChange={(x) => set("notes", x.target.value)} /></label>
        {e.id && <label className="check"><input type="checkbox" checked={e.done} onChange={(x) => set("done", x.target.checked)} /> Concluído</label>}
        {err && <p className="ag-err">{err}</p>}
      </form>
    </Shell>
  );
}

export function RoutineModal({ initial, onSave, onDelete, onClose }) {
  const [r, setR] = useState({ title: "", time: "07:00", duration: 30, days: [1, 2, 3, 4, 5], color: "green", active: true, notes: "", ...initial });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setR((x) => ({ ...x, [k]: v }));
  const toggleDay = (d) => set("days", r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d].sort());
  async function submit(ev) {
    ev.preventDefault();
    setBusy(true);
    setErr("");
    try { await onSave(r); } catch (x) { setErr(x.message); setBusy(false); }
  }
  return (
    <Shell title={r.id ? "Editar rotina" : "Nova rotina"} onClose={onClose} footer={
      <>
        {r.id && <button type="button" className="ag-btn danger" onClick={() => onDelete(r)}><Trash2 size={14} /> Excluir</button>}
        <span className="grow" />
        <button type="button" className="ag-btn" onClick={onClose}>Cancelar</button>
        <button type="submit" form="ag-routine-form" className="ag-btn primary" disabled={busy}>Salvar</button>
      </>
    }>
      <form id="ag-routine-form" onSubmit={submit} className="ag-form">
        <label>Nome<input autoFocus value={r.title} onChange={(x) => set("title", x.target.value)} placeholder="Ex.: Academia, Estudar SQL, Revisão semanal" /></label>
        <div className="row">
          <label>Horário<input type="time" value={r.time} onChange={(x) => set("time", x.target.value)} required /></label>
          <label>Duração (min)<input type="number" min="5" step="5" value={r.duration} onChange={(x) => set("duration", Number(x.target.value))} /></label>
        </div>
        <label>Dias da semana
          <div className="ag-days">{[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} type="button" className={r.days.includes(d) ? "on" : ""} onClick={() => toggleDay(d)}>{WEEKDAYS[d]}</button>)}</div>
        </label>
        <label>Cor<ColorPick value={r.color} onChange={(c) => set("color", c)} /></label>
        <label>Notas<textarea rows={2} value={r.notes} onChange={(x) => set("notes", x.target.value)} /></label>
        <label className="check"><input type="checkbox" checked={r.active} onChange={(x) => set("active", x.target.checked)} /> Ativa (aparece nos dias da semana escolhidos)</label>
        {err && <p className="ag-err">{err}</p>}
      </form>
    </Shell>
  );
}
