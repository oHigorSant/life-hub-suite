"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { BookOpen, Dumbbell, Lock, CheckCircle2, X } from "lucide-react";
import "@/app/estudos/atlas.css";
import { STATUS_LABEL } from "./util";

// a mesma árvore de habilidades do Atlas (Estudos): layout em faixas, fios roteados, níveis e "você está aqui"
const SkillTree = dynamic(() => import("@/components/atlas/SkillTree.js"), { ssr: false, loading: () => <p className="ing-hint" style={{ padding: 24 }}>Montando a trilha…</p> });

export default function Trilha({ index, onOpen, onPractice }) {
  const [sel, setSel] = useState(null);
  const lessons = useMemo(() => index.lessons.filter((l) => l.phase === "gramatica" && l.branch), [index]);
  const byId = useMemo(() => new Map(lessons.map((l) => [l.id, l])), [lessons]);
  const maxTier = Math.max(0, ...lessons.map((l) => l.tier));
  const nodes = useMemo(() => lessons.map((l) => ({
    id: l.id,
    title: l.title.replace(/^Aula \d+ · /, ""),
    branch: l.branch,
    tier: l.tier,
    sort: l.part,
    // o Atlas não tem "aprovado": aparece em andamento (já libera os próximos) com a barra de domínio
    status: l.status === "passed" ? "in_progress" : l.status,
    mastery: l.mastery,
    est_minutes: l.minutes,
    kind: l.tier === maxTier ? "capstone" : (l.prereqs || []).length >= 2 ? "keystone" : undefined,
  })), [lessons, maxTier]);
  const edges = useMemo(() => lessons.flatMap((l) => (l.prereqs || []).filter((p) => byId.has(p)).map((p) => ({ f: p, t: l.id, kind: "hard" }))), [lessons, byId]);

  if (!lessons.length) return <div className="ing-practice"><p className="ing-hint">A trilha de gramática ainda não foi importada.</p></div>;

  const s = sel ? byId.get(sel) : null;
  const done = lessons.filter((l) => l.status === "passed" || l.status === "mastered").length;
  return (
    <div className="ing-trilha">
      <div className="ing-trilha-head">
        <div>
          <h2>Trilha de gramática</h2>
          <p className="ing-hint">A Jornada do Autodidata em árvore: cada aula libera as que dependem dela quando aprovada (domínio de 65% em 3 itens). {done}/{lessons.length} aprovadas.</p>
        </div>
      </div>
      <div className="ing-trilha-body atlas-root" data-theme="light">
        <SkillTree nodes={nodes} edges={edges} selected={sel} onSelect={setSel} />
        {s && (
          <aside className="ing-trilha-panel" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" className="ing-icon close" onClick={() => setSel(null)} aria-label="Fechar"><X size={16} /></button>
            <span className="ing-crumb-g">{s.branch} · nível {s.tier + 1}</span>
            <h3>{s.title}</h3>
            <span className={`ing-pill ${s.status}`}>{STATUS_LABEL[s.status]}{s.mastery ? ` · ${Math.round(s.mastery * 100)}%` : ""}</span>
            {s.missing?.length > 0 && (
              <p className="ing-hint"><Lock size={12} /> Falta aprovar: {s.missing.map((m) => byId.get(m)?.title.replace(/^Aula \d+ · /, "")).filter(Boolean).join(", ")}.</p>
            )}
            {s.prereqs?.length > 0 && !s.missing?.length && <p className="ing-hint"><CheckCircle2 size={12} /> Pré-requisitos aprovados.</p>}
            <p className="ing-hint">~{s.minutes} min · {s.words} palavras de exemplo</p>
            <div className="ing-row wrap">
              <button type="button" className="ing-btn primary" onClick={() => onOpen(s.id)}><BookOpen size={15} /> Estudar</button>
              <button type="button" className="ing-btn" onClick={() => onPractice(s.id)}><Dumbbell size={15} /> Praticar</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
