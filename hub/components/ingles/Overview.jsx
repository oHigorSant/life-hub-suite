"use client";

import { useState } from "react";
import { Flame, GraduationCap, Target, Trophy, AlertTriangle, Clock, ArrowRight } from "lucide-react";
import { post } from "./util";

const TYPE_LABEL = { cloze: "Lacunas", dictation: "Ditado", translate: "Tradução", order: "Ordenar", listen: "Escuta", word: "Vocabulário", "rf-mcq": "Reforço: múltipla escolha", "rf-cloze": "Reforço: lacunas", "rf-translate": "Reforço: tradução" };

export default function Overview({ ov, onOpenLesson, onOpenWords, reload }) {
  const [goal, setGoal] = useState(null);
  if (!ov) return <div className="ing-practice"><p className="ing-hint">Carregando…</p></div>;
  const lv = ov.level;
  const span = lv.to ? lv.to - lv.from : 1;
  const into = lv.to ? Math.min(1, (lv.xp - lv.from) / span) : 1;
  const maxXp = Math.max(1, ...ov.heat.map((h) => h.xp));
  const goalPct = Math.min(100, Math.round((ov.today.minutes / ov.today.goal) * 100));

  async function saveGoal(v) {
    setGoal(null);
    await post("/api/ingles/progress", { op: "goal", minutes: v });
    reload();
  }

  return (
    <div className="ing-over">
      <section className="ing-hero">
        <div className="ing-level">
          <div className="ing-level-n"><Trophy size={18} /> Nível {lv.n}</div>
          <div className="ing-level-t">{lv.title}</div>
          <div className="ing-bar"><i style={{ width: `${into * 100}%` }} /></div>
          <div className="ing-hint">{lv.xp} XP{lv.to ? ` · faltam ${lv.to - lv.xp} para o nível ${lv.n + 1}` : " · nível máximo"}</div>
        </div>
        <div className="ing-stat"><Flame size={18} /><b>{ov.streak}</b><span>dia{ov.streak === 1 ? "" : "s"} seguidos</span></div>
        <div className="ing-stat">
          <Clock size={18} /><b>{ov.today.minutes}<small>/{ov.today.goal} min</small></b>
          <div className="ing-bar sm"><i style={{ width: `${goalPct}%` }} /></div>
          {goal === null ? (
            <button type="button" className="ing-link" onClick={() => setGoal(ov.today.goal)}>meta diária</button>
          ) : (
            <span className="ing-goal"><input type="number" min={5} max={240} step={5} value={goal} onChange={(e) => setGoal(Number(e.target.value))} /><button type="button" className="ing-link" onClick={() => saveGoal(goal)}>salvar</button></span>
          )}
        </div>
        <div className="ing-stat"><Target size={18} /><b>{ov.totals.passed}<small>/{ov.totals.lessons}</small></b><span>lições aprovadas · {ov.totals.mastered} dominadas</span></div>
      </section>

      <section className="ing-card-s">
        <h3>Plano de hoje</h3>
        <div className="ing-plan">
          {ov.plan.dueWords > 0 && (
            <button type="button" className="ing-plan-i" onClick={onOpenWords}>
              <b>Revisar vocabulário</b><span>{ov.plan.dueWords} palavra{ov.plan.dueWords > 1 ? "s" : ""} vencida{ov.plan.dueWords > 1 ? "s" : ""}</span><ArrowRight size={15} />
            </button>
          )}
          {ov.plan.picks.map((p) => (
            <button key={p.id} type="button" className="ing-plan-i" onClick={() => onOpenLesson(p.id)}>
              <b>{p.title}</b><span>{p.status === "in_progress" ? "continuar" : "começar"} · ~{p.minutes} min</span><ArrowRight size={15} />
            </button>
          ))}
          {!ov.plan.picks.length && !ov.plan.dueWords && <p className="ing-hint">Nada pendente. Revise lições dominadas há mais tempo para manter o domínio.</p>}
        </div>
      </section>

      <section className="ing-card-s">
        <h3><GraduationCap size={16} /> Graduação</h3>
        <p className="ing-hint">Uma fase gradua quando 80% das lições estão aprovadas e 40% dominadas. Aprovar: domínio ≥ 65% em 3 itens distintos. Dominar: ≥ 80% em 5 itens, com um acerto difícil.</p>
        <div className="ing-phases">
          {ov.phases.map((p) => (
            <div key={p.id} className={`ing-phase${p.graduated ? " grad" : ""}`}>
              <div className="ing-phase-h"><b>{p.name}</b>{p.graduated && <span className="ing-badge lv-consolidada">graduada</span>}</div>
              <div className="ing-hint">{p.goal}</div>
              <div className="ing-bar"><i style={{ width: `${p.percent}%` }} /></div>
              <div className="ing-phase-n"><span>{p.percent}%</span><span>{p.passed}/{p.total} aprovadas · {p.mastered} dominadas</span></div>
            </div>
          ))}
        </div>
      </section>

      <section className="ing-card-s">
        <h3>Últimos 28 dias</h3>
        <div className="ing-heat" role="img" aria-label="Atividade dos últimos 28 dias">
          {ov.heat.map((h) => <i key={h.d} title={`${h.d}: ${h.xp} XP, ${h.min} min`} style={{ "--a": h.xp ? 0.2 + 0.8 * (h.xp / maxXp) : 0 }} />)}
        </div>
      </section>

      <section className="ing-card-s">
        <h3><AlertTriangle size={16} /> Pontos de atenção</h3>
        {!ov.gaps.stale.length && !ov.gaps.stuck.length && !ov.gaps.byType.length && !ov.gaps.reforco?.length &&<p className="ing-hint">Sem dados suficientes ainda. Faça alguns exercícios para eu apontar onde reforçar.</p>}
        {ov.gaps.byType.length > 0 && (
          <div className="ing-types-avg">
            {ov.gaps.byType.map((t) => <span key={t.type}><b>{TYPE_LABEL[t.type] || t.type}</b> {t.avg}% <small>({t.n})</small></span>)}
          </div>
        )}
        {ov.gaps.reforco?.length > 0 && (
          <div className="ing-types-avg">
            {ov.gaps.reforco.map((t) => <button key={t.title} type="button" className="ing-chip" onClick={onOpenWords} title="Abrir o estudo de reforço">{t.title} <small>({t.items})</small></button>)}
          </div>
        )}
        {ov.gaps.stuck.map((s) => <button key={s.id} type="button" className="ing-gap" onClick={() => onOpenLesson(s.id)}>Travada: {s.title} — domínio {Math.round(s.mastery * 100)}% após {s.attempts} respostas</button>)}
        {ov.gaps.stale.map((s) => <button key={s.id} type="button" className="ing-gap" onClick={() => onOpenLesson(s.id)}>Revisar: {s.title} — sem prática há {s.days} dias</button>)}
      </section>
    </div>
  );
}
