"use client";

import { useEffect, useRef, useState } from "react";
import { brl, brl0, monthShort, num } from "./fx.js";

/** Valor/texto que vira campo ao clicar; Enter ou sair do campo grava, Esc cancela. */
export function Inline({ value, onSave, kind = "text", suffix = "", prefix = "", className = "", placeholder = "—", width }) {
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (edit && ref.current) { ref.current.focus(); ref.current.select(); } }, [edit]);
  const shown = kind === "money" ? num(value) : value;
  function start() { setDraft(kind === "money" ? String(Number(value) || "").replace(".", ",") : String(value ?? "")); setEdit(true); }
  function commit() {
    setEdit(false);
    const raw = draft.trim();
    if (kind === "money") { const n = Number(raw.replace(/\./g, "").replace(",", ".")); if (n > 0 && n !== Number(value)) onSave(n); }
    else if (kind === "day") { const n = Math.round(Number(raw)); if (n >= 1 && n <= 28 && n !== Number(value)) onSave(n); }
    else if (raw && raw !== value) onSave(raw);
  }
  if (edit) {
    return (
      <input ref={ref} className={`fx-inline-input ${className}`} style={{ width: width || (kind === "text" ? 160 : 84) }} value={draft} inputMode={kind === "text" ? "text" : "decimal"}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEdit(false); }} />
    );
  }
  return <button type="button" className={`fx-inline ${className}`} onClick={start} title="Clique para editar">{prefix}{shown === "" || shown == null ? placeholder : shown}{suffix}</button>;
}

/** Interruptor estilo iOS. */
export function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className={`fx-switch${on ? " on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

/** Controle segmentado estilo iOS. */
export function Segmented({ options, value, onChange, small = false }) {
  return (
    <div className={`fx-seg${small ? " small" : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.icon}{o.label}{o.badge ? <em>{o.badge}</em> : null}
        </button>
      ))}
    </div>
  );
}

/** Seleção compacta (categoria, conta). */
export function Pick({ value, onChange, options, placeholder = "—", className = "" }) {
  return (
    <select className={`fx-pick ${className}`} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Minigráfico de linha. */
export function Spark({ data, color = "#0071e3", w = 84, h = 26 }) {
  const max = Math.max(...data, 1), min = Math.min(...data, 0);
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * (w - 4) + 2},${h - 3 - ((v - min) / (max - min || 1)) * (h - 6)}`).join(" ");
  const last = pts.split(" ").pop().split(",");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={color} />
    </svg>
  );
}

/** Barras agrupadas: renda x gasto por mês, com a linha da média de gasto. */
export function FlowBars({ series, height = 190, onPick, active }) {
  const max = Math.max(...series.flatMap((m) => [m.income, m.spend]), 1);
  const avg = series.filter((m) => m.spend > 0).reduce((s, m, _, a) => s + m.spend / a.length, 0);
  return (
    <div className="fx-flow" style={{ height }}>
      <div className="fx-flow-avg" style={{ bottom: `${(avg / max) * (height - 34) + 22}px` }}><span>média {brl0(avg)}</span></div>
      {series.map((m) => (
        <button key={m.key} type="button" className={`fx-flow-col${m.key === active ? " on" : ""}`} onClick={() => onPick?.(m.key)} title={`${monthShort(m.key)}: entrou ${brl(m.income)} · saiu ${brl(m.spend)} · saldo ${brl(m.net)}`}>
          <span className="fx-flow-bars" style={{ height: height - 34 }}>
            <i className="inc" style={{ height: `${(m.income / max) * 100}%` }} />
            <i className="out" style={{ height: `${(m.spend / max) * 100}%` }} />
          </span>
          <span className="fx-flow-lab">{monthShort(m.key)}</span>
        </button>
      ))}
    </div>
  );
}

/** Barras horizontais (ranking). */
export function HBars({ rows, color = "#0071e3", format = brl, max }) {
  const m = max || Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="fx-hbars">
      {rows.map((r) => (
        <li key={r.key || r.label}>
          <span className="fx-hb-top"><span className="fx-hb-label">{r.label}</span><b>{format(r.value)}</b></span>
          <span className="fx-hb-track"><i style={{ width: `${Math.max(2, (r.value / m) * 100)}%`, background: r.color || color }} /></span>
          {r.note ? <span className="fx-hb-note">{r.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** Rosca. */
export function Donut({ slices, total, center }) {
  const size = 168, stroke = 24, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg className="fx-donut" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribuição">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,.06)" strokeWidth={stroke} />
        {slices.map((s) => { const len = total > 0 ? (s.value / total) * c : 0; const el = <circle key={s.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`} strokeDashoffset={-offset} />; offset += len; return el; })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" className="fx-donut-l">{center?.label}</text>
      <text x="50%" y="62%" textAnchor="middle" className="fx-donut-v">{center?.value}</text>
    </svg>
  );
}

/** Barras empilhadas por mês (compromissos). */
export function StackBars({ rows, parts, height = 150 }) {
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="fx-stack" style={{ height }}>
      {rows.map((r) => (
        <div key={r.key} className="fx-stack-col" title={`${monthShort(r.key)}: ${brl(r.total)}`}>
          <span className="fx-stack-val">{brl0(r.total)}</span>
          <span className="fx-stack-bar" style={{ height: height - 44 }}>
            <span style={{ height: `${(r.total / max) * 100}%`, display: "flex", flexDirection: "column-reverse" }}>
              {parts.map((p) => (r[p.key] > 0 ? <i key={p.key} style={{ flex: r[p.key], background: p.color }} /> : null))}
            </span>
          </span>
          <span className="fx-flow-lab">{monthShort(r.key)}</span>
        </div>
      ))}
    </div>
  );
}
