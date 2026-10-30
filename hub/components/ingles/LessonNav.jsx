"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, Lock, GraduationCap, Search } from "lucide-react";

function Ring({ pct, status }) {
  const r = 7, c = 2 * Math.PI * r;
  return (
    <svg className={`ing-ring ${status}`} viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} className="t" />
      <circle cx="9" cy="9" r={r} className="p" strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`} transform="rotate(-90 9 9)" />
    </svg>
  );
}

function StatusIcon({ l }) {
  if (l.status === "mastered") return <span className="ing-st mastered"><Check size={13} strokeWidth={3} /></span>;
  if (l.status === "passed") return <span className="ing-st passed"><Check size={13} strokeWidth={3} /></span>;
  if (l.status === "locked") return <span className="ing-st locked"><Lock size={11} /></span>;
  return <Ring pct={l.percent} status={l.status} />;
}

export default function LessonNav({ index, overview, selectedId, onSelect }) {
  const [open, setOpen] = useState({});
  const [q, setQ] = useState("");

  const byId = useMemo(() => new Map(index.lessons.map((l) => [l.id, l])), [index]);
  const selected = byId.get(selectedId);

  // abre a fase e o grupo da lição atual
  useEffect(() => {
    if (!selected) return;
    setOpen((o) => ({ ...o, [`p:${selected.phase}`]: true, [`g:${selected.group}`]: true }));
  }, [selectedId]);

  const phaseStat = new Map((overview?.phases || []).map((p) => [p.id, p]));
  const match = (l, g) => !q || `${g.title} ${l.title}`.toLowerCase().includes(q.toLowerCase());

  return (
    <nav className="ing-nav" aria-label="Lições">
      <label className="ing-nav-search">
        <Search size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar lição" aria-label="Buscar lição" />
      </label>
      <div className="ing-tree">
        {index.phases.map((p) => {
          const groups = index.groups.filter((g) => g.phase === p.id && g.lessons.some((id) => match(byId.get(id), g)));
          if (!groups.length) return null;
          const st = phaseStat.get(p.id);
          const isOpen = q ? true : !!open[`p:${p.id}`];
          return (
            <div key={p.id} className="ing-phase-grp">
              <button type="button" className="ing-phase-t" onClick={() => setOpen((o) => ({ ...o, [`p:${p.id}`]: !o[`p:${p.id}`] }))} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>{p.name}</span>
                {st?.graduated && <GraduationCap size={14} className="grad" aria-label="Fase graduada" />}
                <em>{st ? `${st.percent}%` : ""}</em>
              </button>
              {isOpen && groups.map((g) => {
                const ls = g.lessons.map((id) => byId.get(id)).filter((l) => match(l, g));
                const done = ls.filter((l) => l.status === "passed" || l.status === "mastered").length;
                const gOpen = q ? true : !!open[`g:${g.id}`];
                return (
                  <div key={g.id} className="ing-group">
                    <button type="button" className="ing-group-t" onClick={() => setOpen((o) => ({ ...o, [`g:${g.id}`]: !o[`g:${g.id}`] }))} aria-expanded={gOpen}>
                      {gOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <span>{g.title}</span>
                      <em>{done}/{ls.length}</em>
                    </button>
                    {gOpen && ls.map((l) => (
                      <button key={l.id} type="button" className={`ing-lesson${l.id === selectedId ? " active" : ""}${l.status === "locked" ? " locked" : ""}`} onClick={() => onSelect(l.id)} title={l.status === "locked" ? "Aprove a parte anterior para liberar (ou abra mesmo assim)" : ""}>
                        <StatusIcon l={l} />
                        <span>{l.title}</span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
