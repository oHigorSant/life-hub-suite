"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Check, Lock, Trophy, Gem, Play, MapPin, Plus, Minus, Maximize2 } from "lucide-react";
import { STATUS } from "./ui.js";
import { layoutTree, roundedPath, CARD_W, CARD_H, BRANCH_GAP } from "./treeLayout.js";

function wrap(text, max = 19) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] = lines[1].replace(/.{0,2}$/, "…");
  }
  return lines;
}

function StatusIcon({ n }) {
  const c = STATUS[n.status].color;
  const p = { size: 16, x: -8, y: -8, strokeWidth: 2.4 };
  if (n.status === "mastered") return <><circle r={15} fill="url(#goldFill)" /><Check {...p} color="#3b2a00" /></>;
  if (n.status === "locked") return <><circle r={15} fill="var(--node-locked-bg)" stroke="var(--node-locked-line)" /><Lock {...p} size={14} x={-7} y={-7} color="var(--node-locked-ink)" /></>;
  const frac = Math.min(1, n.mastery / 0.8);
  const circ = 2 * Math.PI * 13;
  const Ico = n.kind === "capstone" ? Trophy : n.kind === "keystone" ? Gem : Play;
  return (
    <>
      <circle r={15} fill="var(--node-idle-bg)" stroke="var(--node-idle-line)" />
      {n.status === "in_progress" && <circle r={13} fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - frac)} transform="rotate(-90)" />}
      <Ico {...p} size={13} x={-6.5} y={-6.5} color={c} fill={Ico === Play ? c : "none"} />
    </>
  );
}

function Card({ n, color, selected, frontier }) {
  const st = STATUS[n.status];
  const lines = wrap(n.title);
  const W = CARD_W, H = CARD_H;
  const border = n.status === "locked" ? "var(--node-locked-line)" : st.color;
  return (
    <g className="card-g">
      {n.status === "available" && <rect className="pulse-ring" x={-W / 2 - 5} y={-H / 2 - 5} width={W + 10} height={H + 10} rx={18} fill="none" stroke={st.color} strokeWidth="1.5" />}
      {n.status === "mastered" && <rect x={-W / 2 - 8} y={-H / 2 - 8} width={W + 16} height={H + 16} rx={20} fill="url(#goldGlow)" />}
      <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={14} fill={n.status === "locked" ? "var(--node-locked-card)" : "var(--node-card)"} stroke={border} strokeWidth={selected ? 2.4 : 1.4} strokeOpacity={n.status === "locked" ? 1 : 0.85} strokeDasharray={n.kind === "capstone" && n.status !== "mastered" ? "5 4" : undefined} />
      <rect x={-W / 2} y={-H / 2 + 12} width={3.5} height={H - 24} rx={2} fill={color} opacity={n.status === "locked" ? 0.35 : 0.9} />
      <g transform={`translate(${-W / 2 + 28} 0)`}><StatusIcon n={n} /></g>
      <text className={"card-title" + (n.status === "locked" ? " locked" : "")} x={-W / 2 + 52} y={lines.length > 1 ? -9 : -2}>
        {lines.map((l, i) => <tspan key={i} x={-W / 2 + 52} dy={i ? 15 : 0}>{l}</tspan>)}
      </text>
      <text className="card-sub" x={-W / 2 + 52} y={lines.length > 1 ? 24 : 18}>
        {n.status === "mastered" ? "Dominado" : n.status === "locked" ? `${n.est_minutes} min · bloqueado` : `${n.est_minutes} min${n.mastery > 0 ? ` · ${Math.round(n.mastery * 100)}%` : ""}`}
      </text>
      {frontier && (
        <g transform={`translate(0 ${-H / 2 - 20})`}>
          <rect x={-58} y={-12} width={116} height={22} rx={11} fill={st.color} />
          <MapPin size={12} x={-50} y={-7} color="#06121a" strokeWidth={2.6} />
          <text x={8} y={3.5} textAnchor="middle" className="here-label">Você está aqui</text>
        </g>
      )}
    </g>
  );
}

export default function SkillTree({ nodes, edges, selected, onSelect }) {
  const wrapRef = useRef();
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(false);
  const layout = useMemo(() => layoutTree(nodes, edges), [nodes, edges]);
  const fitted = useRef(false);

  // fronteira: onde o aluno está agora (em andamento > disponível, do nível mais baixo)
  const frontier = useMemo(() => {
    const order = (a, b) => a.tier - b.tier || a.sort - b.sort;
    return nodes.filter((n) => n.status === "in_progress").sort(order)[0] || nodes.filter((n) => n.status === "available").sort(order)[0] || null;
  }, [nodes]);

  const levelStats = useMemo(() => {
    const m = new Map();
    for (const n of nodes) {
      const s = m.get(n.tier) || { total: 0, mastered: 0, open: 0 };
      s.total++;
      if (n.status === "mastered") s.mastered++;
      if (n.status !== "locked") s.open++;
      m.set(n.tier, s);
    }
    return m;
  }, [nodes]);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !nodes.length) return;
    const { clientWidth: w, clientHeight: h } = el;
    const RW = w < 720 ? 58 : 104; // trilho de níveis
    const TOP = 44; // barra de ramos
    const k = Math.min(1.1, Math.max(0.12, Math.min((w - RW - 16) / layout.width, (h - TOP - 16) / layout.height)));
    setView({ k, x: RW + (w - RW - layout.width * k) / 2, y: TOP + Math.max(4, (h - TOP - layout.height * k) / 2) });
  }, [layout, nodes.length]);

  const focusOn = useCallback(
    (id, k) => {
      const el = wrapRef.current;
      const p = layout.pos.get(id);
      if (!el || !p) return;
      setView({ k, x: el.clientWidth / 2 - p.x * k, y: el.clientHeight * 0.3 - p.y * k });
    },
    [layout]
  );

  useEffect(() => {
    if (fitted.current || !nodes.length) return;
    fitted.current = true;
    const el = wrapRef.current;
    const mobile = el.clientWidth < 720;
    const target = frontier || nodes[0];
    focusOn(target.id, mobile ? 0.62 : 0.9);
  }, [nodes.length]); // eslint-disable-line

  useEffect(() => {
    const el = wrapRef.current;
    if (!selected || !el || el.clientWidth >= 720) return;
    const p = layout.pos.get(selected);
    if (p) setView((v) => ({ ...v, x: el.clientWidth / 2 - p.x * v.k, y: el.clientHeight * 0.18 - p.y * v.k }));
  }, [selected]); // eslint-disable-line

  const zoomAt = (cx, cy, factor) =>
    setView((v) => {
      const k = Math.min(2.2, Math.max(0.12, v.k * factor));
      const f = k / v.k;
      return { k, x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f };
    });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const wheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey) return zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01));
      // roda = rolar (vertical/horizontal), como num documento; ctrl+roda = zoom
      setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  const ptrs = useRef(new Map());
  const last = useRef(null);
  const moved = useRef(0);
  const onDown = (e) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = 0;
    last.current = null;
    setDrag(true);
  };
  const onMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    const prev = ptrs.current.get(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...ptrs.current.values()];
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (last.current) {
        const r = wrapRef.current.getBoundingClientRect();
        zoomAt((pts[0].x + pts[1].x) / 2 - r.left, (pts[0].y + pts[1].y) / 2 - r.top, d / last.current);
      }
      last.current = d;
      moved.current += 10;
    } else {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      moved.current += Math.abs(dx) + Math.abs(dy);
      if (moved.current > 4) setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
  };
  const onUp = (e) => {
    ptrs.current.delete(e.pointerId);
    last.current = null;
    if (!ptrs.current.size) setDrag(false);
  };

  const focus = hover || selected;
  const hot = useMemo(() => {
    if (!focus) return null;
    const up = new Map();
    const down = new Map();
    for (const e of edges) {
      if (e.kind !== "hard") continue;
      (up.get(e.t) || up.set(e.t, []).get(e.t)).push(e.f);
      (down.get(e.f) || down.set(e.f, []).get(e.f)).push(e.t);
    }
    const seen = new Set([focus]);
    const walk = (m, id) => (m.get(id) || []).forEach((x) => !seen.has(x) && (seen.add(x), walk(m, x)));
    walk(up, focus);
    walk(down, focus);
    return seen;
  }, [focus, edges]);

  const laneColor = useMemo(() => new Map(nodes.map((n) => [n.id, layout.lanes.find((l) => l.name === n.branch)?.color || "#8b5cf6"])), [nodes, layout]);
  const statusOf = useMemo(() => new Map(nodes.map((n) => [n.id, n.status])), [nodes]);
  const frontierTier = frontier?.tier ?? 0;

  return (
    <div ref={wrapRef} className={"tree-wrap" + (drag ? " dragging" : "")} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <svg className={"tree-svg" + (hot ? " dim-all" : "")} onClick={(e) => { if (moved.current < 5 && e.target.tagName === "svg") onSelect(null); }}>
        <defs>
          <linearGradient id="goldFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset="1" stopColor="#f59e0b" /></linearGradient>
          <radialGradient id="goldGlow"><stop offset="0" stopColor="#fbbf24" stopOpacity="0.28" /><stop offset="1" stopColor="#fbbf24" stopOpacity="0" /></radialGradient>
        </defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* níveis: faixas horizontais com progresso */}
          {layout.levels.map((lv) => {
            const s = levelStats.get(lv.tier) || { total: 0, mastered: 0, open: 0 };
            const done = s.total && s.mastered === s.total;
            const locked = s.open === 0;
            const current = lv.tier === frontierTier;
            return (
              <g key={lv.tier} className={"level" + (locked ? " locked" : "") + (current ? " current" : "")}>
                <rect x={0} y={lv.y} width={layout.width} height={lv.h} fill={current ? "rgba(34,211,238,0.045)" : lv.tier % 2 ? "var(--band-a)" : "var(--band-b)"} />
                <line x1={0} x2={layout.width} y1={lv.y} y2={lv.y} stroke="var(--grid-line)" />
              </g>
            );
          })}
          {/* ramos: colunas com o nome no topo e uma guia vertical */}
          {layout.lanes.map((l, i) => (
            <g key={l.name}>
              {/* coluna da área: leve tinta da cor do ramo + divisória sutil entre áreas */}
              <rect x={l.x - BRANCH_GAP / 2} y={layout.levels[0] ? layout.levels[0].y : 0} width={l.w + BRANCH_GAP} height={layout.height} fill={l.color} opacity={i % 2 ? 0.018 : 0.03} />
              {i > 0 && <line x1={l.x - BRANCH_GAP / 2} x2={l.x - BRANCH_GAP / 2} y1={layout.levels[0] ? layout.levels[0].y : 0} y2={layout.height - 20} stroke="var(--grid-line-2)" strokeWidth="1" />}
            </g>
          ))}
          {/* fios */}
          {(() => {
            const items = layout.routes.map((r, i) => {
              const isHot = hot && hot.has(r.from) && hot.has(r.to);
              const col = statusOf.get(r.from) === "mastered" ? "#fbbf24" : laneColor.get(r.from);
              const lastP = r.pts[r.pts.length - 1];
              return { i, isHot, col, d: roundedPath(r.pts, 10), lastP };
            });
            const draw = (it) => (
              <g key={it.i} className={"wire" + (it.isHot ? " hot" : "")}>
                <path d={it.d} className="wire-halo" />
                <path d={it.d} className="wire-line" style={{ stroke: it.col, color: it.col }} />
                <path d={`M${it.lastP[0] - 4.5},${it.lastP[1] - 1} L${it.lastP[0]},${it.lastP[1] + 7} L${it.lastP[0] + 4.5},${it.lastP[1] - 1} Z`} fill={it.col} className="wire-arrow" />
              </g>
            );
            return [...items.filter((x) => !x.isHot).map(draw), ...items.filter((x) => x.isHot).map(draw)];
          })()}
          {/* cartões */}
          {nodes.map((n) => {
            const p = layout.pos.get(n.id);
            if (!p) return null;
            const isHot = hot ? hot.has(n.id) : false;
            return (
              <g key={n.id} className={`node-g ${n.status}${isHot ? " hot" : ""}`} transform={`translate(${p.x} ${p.y})`} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} onClick={(ev) => { ev.stopPropagation(); if (moved.current < 5) onSelect(n.id); }}>
                <Card n={n} color={laneColor.get(n.id)} selected={selected === n.id} frontier={frontier?.id === n.id} />
              </g>
            );
          })}
        </g>
        {/* trilho fixo à esquerda: níveis e progresso (sempre visível) */}
        {(() => {
          const el = wrapRef.current;
          const H = el?.clientHeight || 800;
          const mobile = (el?.clientWidth || 1200) < 720;
          const RW = mobile ? 58 : 104;
          return (
            <g className="rail">
              <rect x={0} y={0} width={RW} height={H} fill="var(--level-rail)" />
              <line x1={RW} x2={RW} y1={0} y2={H} stroke="var(--grid-line-2)" />
              {layout.levels.map((lv) => {
                const cy = view.y + (lv.y + lv.h / 2) * view.k;
                if (cy < 40 || cy > H + 30) return null;
                // afastado demais: mostra só alguns rótulos para não sobrepor
                const spacing = lv.h * view.k;
                const every = spacing >= 54 ? 1 : Math.ceil(54 / spacing);
                if (lv.tier % every !== 0 && lv.tier !== frontierTier) return null;
                const s = levelStats.get(lv.tier) || { total: 0, mastered: 0, open: 0 };
                const done = s.total && s.mastered === s.total;
                const locked = s.open === 0;
                const current = lv.tier === frontierTier;
                const bw = RW - 22;
                return (
                  <g key={lv.tier} transform={`translate(11 ${cy})`} className={"level" + (locked ? " locked" : "") + (current ? " current" : "")}>
                    {current && <rect x={-11} y={-26} width={3} height={52} rx={1.5} fill="#22d3ee" />}
                    <text className="level-label" y={-8}>{mobile ? `N${lv.tier + 1}` : `NÍVEL ${lv.tier + 1}`}</text>
                    {done ? <Check size={13} x={mobile ? 12 + String(lv.tier + 1).length * 8 : 74} y={-19} color="#fbbf24" strokeWidth={3} /> : locked ? <Lock size={11} x={mobile ? 13 + String(lv.tier + 1).length * 8 : 75} y={-18} color="var(--node-locked-ink)" /> : null}
                    <rect x={0} y={1} width={bw} height={4} rx={2} fill="var(--grid-line-2)" />
                    <rect x={0} y={1} width={s.total ? (bw * s.mastered) / s.total : 0} height={4} rx={2} fill={done ? "#fbbf24" : "#8b5cf6"} />
                    <text className="level-sub" y={18}>{mobile ? `${s.mastered}/${s.total}` : done ? "concluído" : locked ? "bloqueado" : `${s.mastered}/${s.total} dominadas`}</text>
                  </g>
                );
              })}
            </g>
          );
        })()}
        {/* cabeçalho fixo: ramos */}
        {(() => {
          const el = wrapRef.current;
          const W = el?.clientWidth || 1200;
          const mobile = W < 720;
          const RW = mobile ? 58 : 104;
          return (
            <g className="branch-bar">
              <rect x={RW} y={0} width={W} height={40} fill="var(--level-rail)" />
              {layout.lanes.map((l) => {
                const x0 = view.x + l.x * view.k + 6, w = l.w * view.k - 12;
                if (x0 + w < RW || x0 > W || w < 30) return null;
                const max = Math.max(3, Math.floor(w / 7.6));
                const name = l.name.length > max ? l.name.slice(0, max - 1) + "…" : l.name;
                return (
                  <g key={l.name}>
                    <rect x={Math.max(x0, RW + 4)} y={8} width={Math.max(10, Math.min(w, x0 + w - RW - 4))} height={24} rx={12} fill={l.color} fillOpacity="0.12" stroke={l.color} strokeOpacity="0.4" />
                    {w >= 56 && <text className="branch-head" x={Math.max(x0, RW + 4) + Math.max(10, Math.min(w, x0 + w - RW - 4)) / 2} y={24.5} textAnchor="middle" style={{ fill: l.color }}>{name}</text>}
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>
      <div className="tree-ctl" onPointerDown={(e) => e.stopPropagation()}>
        <button className="btn" onClick={() => zoomAt(wrapRef.current.clientWidth / 2, wrapRef.current.clientHeight / 2, 1.25)} title="Aproximar" aria-label="Aproximar"><Plus size={18} /></button>
        <button className="btn" onClick={() => zoomAt(wrapRef.current.clientWidth / 2, wrapRef.current.clientHeight / 2, 0.8)} title="Afastar" aria-label="Afastar"><Minus size={18} /></button>
        <button className="btn" onClick={fit} title="Ver a trilha inteira" aria-label="Ver a trilha inteira"><Maximize2 size={16} /></button>
        {frontier && <button className="btn" onClick={() => focusOn(frontier.id, wrapRef.current.clientWidth < 720 ? 0.62 : 0.9)} title="Ir para onde estou" aria-label="Ir para onde estou"><MapPin size={17} /></button>}
      </div>
      <div className="tree-legend" onPointerDown={(e) => e.stopPropagation()}>
        {Object.entries(STATUS).map(([k, v]) => <span key={k}><i style={{ background: v.color }} />{v.label}</span>)}
        <span className="dim lg-extra">o fio liga o pré-requisito à próxima etapa</span>
      </div>
    </div>
  );
}
