"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, Compass, Flame, Check, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Eye, EyeOff, GraduationCap, Newspaper,
  Cpu, Pause, Play, Quote, RotateCcw, SlidersHorizontal, Target, Timer, Trash2, Wallet, CircleCheck, Activity, Plus, ExternalLink, School, Video,
} from "lucide-react";
import { useLive } from "@/components/live/liveClient.js";
import { relDay, whenLabel, countdown } from "@/lib/agenda/urgency.js";
import { usePomodoro, useCountdown } from "@/components/agenda/timeEngine.js";

const WIDGET_LABEL = {
  clock: "Data e relógio", phrase: "Frase do dia", tasks: "Tarefas do dia", bills: "Contas do dia", studies: "Estudos",
  goals: "Metas", progress: "Progresso", agenda: "Agenda e tempo", usage: "IAs e limites", news: "Notícias", trilhas: "Trilhas",
};
const SPAN = { clock: 8, phrase: 4, tasks: 4, bills: 4, studies: 4, goals: 4, progress: 4, agenda: 4, usage: 4, trilhas: 4, news: 12 };

const brl = (n) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mmss = (sec) => { const s = Math.max(0, Math.round(sec)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const shortDate = (ymd) => { const [, m, d] = ymd.split("-"); return `${d}/${m}`; };

async function post(url, payload) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha na operação.");
  return r.json().catch(() => ({}));
}

// ---------------------------------------------------------------- peças

function Card({ id, icon: Icon, tint, title, href, hrefLabel, children, className = "", edit }) {
  return (
    <section className={`hm-card hm-w-${id} ${className}`} style={{ "--tint": tint }}>
      {title && (
        <header className="hm-card-head">
          <span className="hm-chip"><Icon size={16} strokeWidth={2.2} /></span>
          <h2>{title}</h2>
          {href && !edit && <Link href={href} className="hm-more" aria-label={hrefLabel}>{hrefLabel}<ChevronRight size={14} /></Link>}
        </header>
      )}
      {children}
    </section>
  );
}

function Empty({ children }) { return <p className="hm-empty">{children}</p>; }

function Ring({ r, value, color, stroke = 9 }) {
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <>
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeOpacity=".16" strokeWidth={stroke} />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 70 70)" className="hm-ring-arc" />
    </>
  );
}

// ---------------------------------------------------------------- widgets

function ClockWidget({ greeting }) {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const time = now ? now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--:--";
  const sec = now ? String(now.getSeconds()).padStart(2, "0") : "--";
  const raw = now ? now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }) : "";
  const date = raw.charAt(0).toUpperCase() + raw.slice(1);
  return (
    <section className="hm-card hm-clock">
      <div className="hm-clock-text">
        <p className="hm-eyebrow">{date}</p>
        <h1>{greeting}{USER_NAME ? `, ${USER_NAME}` : ""}</h1>
      </div>
      <div className="hm-clock-time" aria-label="Hora atual">
        <span>{time}</span><em>{sec}</em>
      </div>
    </section>
  );
}

function PhraseWidget({ phrase }) {
  return (
    <Card id="phrase" icon={Quote} tint="#bf5af2" title="Frase do dia">
      {phrase?.text ? (
        <figure className="hm-quote">
          <blockquote>{phrase.text}</blockquote>
          {phrase.ref && <figcaption>{phrase.ref}</figcaption>}
        </figure>
      ) : (
        <Empty>Peça ao Claude: &ldquo;escreva a frase do dia a partir do meu estudo bíblico&rdquo;.</Empty>
      )}
    </Card>
  );
}

function TasksWidget({ data, reload, edit }) {
  const [items, setItems] = useState(data.items);
  useEffect(() => setItems(data.items), [data.items]);
  async function toggle(id) {
    setItems((l) => l.map((c) => (c.id === id ? { ...c, done: !c.done } : c)));
    try { await post("/api/tasks/toggle-done", { cardId: id }); } catch { /* recarrega abaixo */ }
    reload();
  }
  const total = data.openCount + data.doneCount;
  return (
    <Card id="tasks" icon={CircleCheck} tint="#0a84ff" title="Tarefas do dia" href="/tarefas" hrefLabel="Abrir" edit={edit}>
      <p className="hm-sub">{total ? `${data.doneCount} de ${total} concluídas` : "Nada com prazo para hoje"}
        {data.overdueCount > 0 && <span className="hm-late"> · {data.overdueCount} atrasada{data.overdueCount > 1 ? "s" : ""}</span>}</p>
      {total > 0 && <div className="hm-bar"><i style={{ width: `${(data.doneCount / total) * 100}%` }} /></div>}
      <ul className="hm-list">
        {items.length === 0 && <Empty>Dia livre. Aproveite.</Empty>}
        {items.map((c) => (
          <li key={c.id} className={c.done ? "is-done" : ""}>
            <button type="button" className="hm-check" aria-label={c.done ? "Reabrir" : "Concluir"} onClick={() => toggle(c.id)}>
              {c.done && <Check size={13} strokeWidth={3} />}
            </button>
            <div><span className="hm-row-title">{c.title}</span>
              <span className="hm-row-sub">{c.board}{c.overdue ? <b className="hm-late"> · venceu {shortDate(c.due)}</b> : ""}</span></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BillsWidget({ data, edit }) {
  return (
    <Card id="bills" icon={Wallet} tint="#30d158" title="Contas do dia" href="/financas" hrefLabel="Abrir" edit={edit}>
      <p className="hm-sub">
        {data.nowCount ? <>{data.nowCount} para pagar · <b>{brl(data.nowTotal)}</b></> : "Nenhuma conta para hoje"}
      </p>
      <ul className="hm-list">
        {data.now.map((b) => (
          <li key={b.id}>
            <div className="hm-grow"><span className="hm-row-title">{b.name}</span>
              <span className={`hm-row-sub${b.overdue ? " hm-late" : ""}`}>{b.overdue ? `Atrasada desde ${shortDate(b.due)}` : "Vence hoje"}{b.installment ? ` · ${b.installment.number}/${b.installment.total}` : ""}</span></div>
            <span className="hm-amount">{brl(b.amount)}</span>
          </li>
        ))}
      </ul>
      {data.next.length > 0 && (
        <>
          <p className="hm-sec">Próximos 7 dias · {brl(data.nextTotal)}</p>
          <ul className="hm-list hm-dim">
            {data.next.map((b) => (
              <li key={b.id}>
                <div className="hm-grow"><span className="hm-row-title">{b.name}</span><span className="hm-row-sub">{shortDate(b.due)}</span></div>
                <span className="hm-amount">{brl(b.amount)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

function StudiesWidget({ data, edit }) {
  const first = data.areas.find((a) => a.plan.length) || data.areas[0];
  return (
    <Card id="studies" icon={GraduationCap} tint="#ff9f0a" title="Estudos" href="/estudos" hrefLabel="Abrir" edit={edit}>
      {data.areas.length === 0 && <Empty>Crie uma área em Estudos para ver o plano de hoje.</Empty>}
      {data.dueTotal > 0 && (
        <Link href="/estudos/review" className="hm-pill">{data.dueTotal} cartões para revisar<ChevronRight size={14} /></Link>
      )}
      {first && first.plan.length > 0 && (
        <>
          <p className="hm-sec">Hoje · {first.title}</p>
          <ul className="hm-list">
            {first.plan.map((p) => (
              <li key={p.id}><Link href={`/estudos/s/${first.id}/n/${p.id}`} className="hm-grow hm-link">
                <span className="hm-row-title">{p.title}</span><span className="hm-row-sub">{p.minutes} min</span></Link></li>
            ))}
          </ul>
        </>
      )}
      {data.areas.length > 0 && (
        <ul className="hm-areas">
          {data.areas.slice(0, 4).map((a) => (
            <li key={a.id}><Link href={`/estudos/s/${a.id}`} className="hm-link">
              <span>{a.title}</span><em>{a.percent}%</em>
              <div className="hm-bar thin"><i style={{ width: `${a.percent}%`, background: a.color || undefined }} /></div></Link></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GoalsWidget({ goals, reload, edit }) {
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState("");
  async function save(goal) { await post("/api/home", { op: "upsertGoal", goal }); reload(); }
  async function add(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    await save({ title: draft.trim(), progress: 0 });
    setDraft("");
  }
  return (
    <Card id="goals" icon={Target} tint="#ff375f" title="Metas" edit={edit}>
      <ul className="hm-goals">
        {goals.length === 0 && <Empty>Defina o que você quer alcançar.</Empty>}
        {goals.map((g) => (
          <li key={g.id} className={open === g.id ? "is-open" : ""}>
            <button type="button" className="hm-goal-row" onClick={() => setOpen(open === g.id ? null : g.id)}>
              <span className="hm-row-title">{g.title}</span><em>{g.progress}%</em>
              <div className="hm-bar thin"><i style={{ width: `${g.progress}%` }} /></div>
            </button>
            {open === g.id && (
              <div className="hm-goal-edit">
                <input type="range" min="0" max="100" step="5" defaultValue={g.progress} aria-label="Progresso"
                  onPointerUp={(e) => save({ ...g, progress: Number(e.currentTarget.value) })}
                  onKeyUp={(e) => save({ ...g, progress: Number(e.currentTarget.value) })} />
                <button type="button" className="hm-icon-btn danger" aria-label="Excluir meta"
                  onClick={async () => { await post("/api/home", { op: "deleteGoal", id: g.id }); setOpen(null); reload(); }}><Trash2 size={15} /></button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form className="hm-add" onSubmit={add}>
        <Plus size={15} /><input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Nova meta" aria-label="Nova meta" />
      </form>
    </Card>
  );
}

function ProgressWidget({ tasks, studies, goals }) {
  const total = tasks.openCount + tasks.doneCount;
  const t = total ? Math.round((tasks.doneCount / total) * 100) : 0;
  const g = goals.length ? Math.round(goals.reduce((s, x) => s + x.progress, 0) / goals.length) : 0;
  const rings = [
    { label: "Tarefas", value: t, color: "#ff375f", r: 58 },
    { label: "Estudos", value: studies.avg, color: "#30d158", r: 44 },
    { label: "Metas", value: g, color: "#0a84ff", r: 30 },
  ];
  return (
    <Card id="progress" icon={Activity} tint="#ff375f" title="Progresso">
      <div className="hm-rings">
        <svg viewBox="0 0 140 140" role="img" aria-label="Anéis de progresso">
          {rings.map((x) => <Ring key={x.label} r={x.r} value={x.value} color={x.color} />)}
        </svg>
        <ul>
          {rings.map((x) => (
            <li key={x.label}><i style={{ background: x.color }} /><span>{x.label}</span><b>{x.value}%</b></li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function AgendaWidget({ data, edit }) {
  const pomo = usePomodoro();
  const timer = useCountdown();
  const nowHM = new Date().toTimeString().slice(0, 5);
  const upcoming = data.items.filter((i) => !i.start || (i.end || i.start) >= nowHM).slice(0, 4);
  const pomoOn = pomo.state.running;
  const timerOn = timer.t.running;
  return (
    <Card id="agenda" icon={CalendarDays} tint="#5e5ce6" title="Agenda e tempo" href="/agenda" hrefLabel="Abrir" edit={edit}>
      <ul className="hm-list hm-timeline">
        {upcoming.length === 0 && <Empty>Sem compromissos pela frente.</Empty>}
        {upcoming.map((i) => (
          <li key={i.id}><span className="hm-time">{i.start || "Dia"}</span>
            <div className="hm-grow"><span className="hm-row-title">{i.title}</span>{i.end && <span className="hm-row-sub">até {i.end}</span>}</div></li>
        ))}
      </ul>
      <div className="hm-clocks">
        <div className={`hm-mini${pomoOn ? " on" : ""}`}>
          <span className="hm-mini-label"><Timer size={14} /> Pomodoro</span>
          <strong>{mmss(pomo.remainingSec)}</strong>
          <div className="hm-mini-actions">
            <button type="button" aria-label={pomoOn ? "Pausar" : "Iniciar"} onClick={pomoOn ? pomo.pause : pomo.start}>{pomoOn ? <Pause size={15} /> : <Play size={15} />}</button>
            <button type="button" aria-label="Reiniciar" onClick={pomo.reset}><RotateCcw size={14} /></button>
          </div>
        </div>
        <div className={`hm-mini${timerOn ? " on" : ""}`}>
          <span className="hm-mini-label"><Timer size={14} /> Timer</span>
          <strong>{mmss(timer.remainingSec)}</strong>
          <div className="hm-mini-actions">
            <button type="button" aria-label={timerOn ? "Pausar" : "Iniciar"} onClick={timerOn ? timer.pause : timer.start}>{timerOn ? <Pause size={15} /> : <Play size={15} />}</button>
            <button type="button" aria-label="Reiniciar" onClick={timer.reset}><RotateCcw size={14} /></button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function resetIn(ms, now) {
  const min = Math.max(0, Math.round((ms - now) / 60000));
  if (min < 60) return `renova em ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `renova em ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  const d = new Date(ms);
  return `renova ${d.toLocaleDateString("pt-BR", { weekday: "short" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function UsageWidget() {
  const [s, setS] = useState(null);
  const [idx, setIdx] = useState(0);
  const track = useRef(null);
  const last = useRef(0); // última interação do usuário (pausa o avanço automático)
  const hover = useRef(false);

  useEffect(() => {
    let off = false;
    const load = () => fetch("/api/agente/engines", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && !off && setS(d)).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { off = true; clearInterval(t); };
  }, []);
  useLive(["engines"], () => { fetch("/api/agente/engines", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setS(d)).catch(() => {}); });

  const go = useCallback((i) => {
    const el = track.current; if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }, []);
  // avança sozinho a cada 7 s, exceto com o mouse em cima ou logo depois de o usuário mexer
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (hover.current || Date.now() - last.current < 15_000) return;
      const el = track.current; if (!el) return;
      go((Math.round(el.scrollLeft / el.clientWidth) + 1) % 3);
    }, 7000);
    return () => clearInterval(t);
  }, [go]);
  const onScroll = () => { const el = track.current; if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth)); };
  const touch = () => { last.current = Date.now(); };

  const NAME = { gemini: "Gemini", claude: "Claude", openrouter: "OpenRouter" };
  const d1 = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const fmtN = (n) => (n >= 1e6 ? `${d1(n / 1e6)} mi` : n >= 1e3 ? `${d1(n / 1e3)} mil` : String(n || 0));
  const usd = (n) => `US$ ${(Number(n) || 0).toFixed(2)}`;
  const eng = (id) => s.engines.find((e) => e.id === id);
  const chip = (id) => {
    const e = eng(id);
    if (!e.enabled) return <span className="hm-ai-chip off">desligado</span>;
    if (e.reason === "sem chave") return <span className="hm-ai-chip off">sem chave</span>;
    if (e.available) return <span className="hm-ai-chip ok">disponível</span>;
    return <span className="hm-ai-chip warn">em espera{e.until ? ` · ${resetIn(e.until, s.now).replace("renova em ", "")}` : ""}</span>;
  };
  const cfg = s?.config;
  const mode = cfg ? (cfg.mode === "auto" ? `Automático: ${cfg.chain.map((i) => NAME[i]).join(" › ")}` : `Fixo em ${NAME[cfg.manual.engine]}${cfg.manual.strict ? " (rígido)" : ""}`) : "";
  const wins = s ? s.claude.windows.filter((w) => w.type === "five_hour" || w.type === "seven_day" || w.percent > 0) : [];
  const gReq = s ? s.gemini.keys.reduce((a, k) => a + k.models.reduce((b, m) => b + m.requests, 0), 0) : 0;
  const credit = s?.openrouter.account?.credits;
  const creditPct = credit && credit.total > 0 ? Math.round((credit.remaining / credit.total) * 100) : null;

  return (
    <Card id="usage" icon={Cpu} tint="#d97757" title="IAs e limites" href="/motores" hrefLabel="Motores">
      {!s && <div className="hm-loading" style={{ height: 150 }} aria-busy="true" />}
      {s && (
        <div className="hm-ai" onMouseEnter={() => { hover.current = true; }} onMouseLeave={() => { hover.current = false; }} onPointerDown={touch} onTouchStart={touch} onWheel={touch} onFocus={touch}>
          <div className="hm-ai-track" ref={track} onScroll={onScroll} tabIndex={0} aria-label="IAs e limites (deslize para ver as outras)">
            <article className="hm-ai-slide" aria-label="Claude">
              <header><b>Claude</b>{chip("claude")}</header>
              {wins.length === 0 && <p className="hm-empty">Sem dados ainda. Aparecem depois da próxima conversa com o Claude.</p>}
              <ul className="hm-usage">
                {wins.map((w) => (
                  <li key={w.type} className={w.percent >= 90 ? "hot" : w.percent >= 70 ? "warm" : ""}>
                    <div className="hm-usage-top"><span>{w.label}</span><b>{w.percent}%</b></div>
                    <div className="hm-bar"><i style={{ width: `${Math.min(100, w.percent)}%` }} /></div>
                    <span className="hm-row-sub">{w.expired ? "janela renovada" : w.resetsAt ? resetIn(w.resetsAt, s.now) : ""}</span>
                  </li>
                ))}
              </ul>
              <p className="hm-usage-foot">Modelo da CLI: {s.claude.model === "padrão" ? "padrão" : s.claude.model.replace("claude-", "").replace(/-/g, " ")}</p>
            </article>

            <article className="hm-ai-slide" aria-label="Gemini">
              <header><b>Gemini</b>{chip("gemini")}</header>
              <ul className="hm-usage">
                <li>
                  <div className="hm-usage-top"><span>Pedidos hoje</span><b>{gReq}</b></div>
                  <span className="hm-row-sub">{fmtN(s.today.gemini.inTok)} tokens de entrada · {fmtN(s.today.gemini.outTok)} de saída{s.today.gemini.errors ? ` · ${s.today.gemini.errors} erro(s)` : ""}</span>
                </li>
                {s.gemini.keys.map((k) => {
                  const req = k.models.reduce((a, m) => a + m.requests, 0);
                  const hit = k.models.filter((m) => m.cooldown);
                  const soon = hit.length ? Math.min(...hit.map((m) => m.cooldown.until)) : 0;
                  return (
                    <li key={k.id} className={hit.length === k.models.length ? "hot" : hit.length ? "warm" : ""}>
                      <div className="hm-usage-top"><span>Chave …{k.tail}</span><b>{req}</b></div>
                      <span className="hm-row-sub">{hit.length === 0 ? "livre" : `${hit.length === k.models.length ? "em espera" : `${hit.length} modelo(s) em espera`} · volta em ${resetIn(soon, s.now).replace("renova em ", "")}`}</span>
                    </li>
                  );
                })}
                {s.gemini.keys.length === 0 && <li><span className="hm-row-sub">Nenhuma chave configurada.</span></li>}
              </ul>
              <p className="hm-usage-foot">Grátis · {s.config.models.gemini.join(", ")}</p>
            </article>

            <article className="hm-ai-slide" aria-label="OpenRouter">
              <header><b>OpenRouter</b>{chip("openrouter")}</header>
              <ul className="hm-usage">
                {credit ? (
                  <li className={creditPct !== null && creditPct <= 10 ? "hot" : creditPct !== null && creditPct <= 30 ? "warm" : ""}>
                    <div className="hm-usage-top"><span>Saldo da conta</span><b>{usd(credit.remaining)}</b></div>
                    <div className="hm-bar"><i style={{ width: `${Math.max(2, creditPct ?? 0)}%` }} /></div>
                    <span className="hm-row-sub">{usd(credit.used)} usados de {usd(credit.total)}</span>
                  </li>
                ) : <li><span className="hm-row-sub">{s.openrouter.hasKey ? "Adicione a chave de gerenciamento para ver o saldo." : "Sem chave configurada."}</span></li>}
                <li>
                  <div className="hm-usage-top"><span>Hoje neste hub</span><b>{usd(s.today.openrouter.cost)}</b></div>
                  <span className="hm-row-sub">{s.today.openrouter.requests} pedidos · {fmtN(s.today.openrouter.inTok)} tokens de entrada</span>
                </li>
                {s.openrouter.account?.keys?.length > 0 && (
                  <li>
                    <div className="hm-usage-top"><span>30 dias, todas as chaves</span><b>{usd(s.openrouter.account.keys.reduce((a, k) => a + (Number(k.month) || 0), 0))}</b></div>
                  </li>
                )}
              </ul>
              <p className="hm-usage-foot">Modelo: {s.config.models.openrouter}</p>
            </article>
          </div>
          <div className="hm-ai-foot">
            <span className="hm-row-sub">{mode}</span>
            <div className="hm-ai-dots" role="tablist" aria-label="Escolher IA">
              {["Claude", "Gemini", "OpenRouter"].map((n, i) => <button key={n} type="button" role="tab" aria-selected={idx === i} aria-label={n} className={idx === i ? "on" : ""} onClick={() => { touch(); go(i); }} />)}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

const SOURCES = [["all", "Todas"], ["google", "Google Notícias"], ["techdrops", "Tech Drops"], ["aidrops", "AI Drops"], ["moneydrops", "Money Drops"]];

/** Foto da notícia. Sem Referer (alguns sites bloqueiam hotlink) e, se não carregar, cai para o cartão colorido com o nome da fonte. */
function NewsImage({ n, eager }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [n.image]);
  const show = n.image && !failed;
  return (
    <div className="hm-news-img" data-src={n.sourceId}>
      {show ? <img src={n.image} alt="" referrerPolicy="no-referrer" loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} /> : <span>{n.source}</span>}
    </div>
  );
}

function NewsWidget() {
  const [items, setItems] = useState(null);
  const [src, setSrc] = useState("all");
  const row = useRef(null);
  useEffect(() => {
    let off = false;
    fetch("/api/home/news", { cache: "no-store" }).then((r) => r.json()).then((d) => !off && setItems(d.items || [])).catch(() => !off && setItems([]));
    return () => { off = true; };
  }, []);
  const shown = useMemo(() => (items || []).filter((i) => src === "all" || i.sourceId === src), [items, src]);
  const scroll = (dir) => row.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  return (
    <Card id="news" icon={Newspaper} tint="#ff453a" title="Notícias">
      <div className="hm-news-bar">
        <div className="hm-seg" role="tablist">
          {SOURCES.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={src === id} className={src === id ? "on" : ""} onClick={() => setSrc(id)}>{label}</button>
          ))}
        </div>
        <div className="hm-arrows">
          <button type="button" aria-label="Anterior" onClick={() => scroll(-1)}><ChevronLeft size={16} /></button>
          <button type="button" aria-label="Próxima" onClick={() => scroll(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="hm-carousel" ref={row}>
        {items === null && [0, 1, 2, 3].map((i) => <div key={i} className="hm-news skeleton" />)}
        {items && shown.length === 0 && <Empty>Sem notícias agora.</Empty>}
        {shown.map((n, i) => (
          <a key={n.url + i} className="hm-news" href={n.url} target="_blank" rel="noopener noreferrer">
            <NewsImage n={n} eager />
            <div className="hm-news-body">
              <span className="hm-news-src">{n.source}</span>
              <h3>{n.title}</h3>
              {n.summary && <p>{n.summary}</p>}
              <ExternalLink size={13} className="hm-news-go" />
            </div>
          </a>
        ))}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Trilhas (app de aprendizado)

function TrilhasWidget({ edit }) {
  const [s, setS] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, []);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const j = async (u) => { const r = await fetch(u, { cache: "no-store" }); if (!r.ok) throw new Error(); return r.json(); };
        const [p, tracks] = await Promise.all([j("/trilhas-app/api/progress"), j("/trilhas-app/api/tracks")]);
        const ready = tracks.filter((t) => !t.generating || t.chapters.some((c) => c.lessons.length));
        const id = (ready.find((t) => t.id === p?.lastTrack) || ready[0])?.id;
        if (!id) { if (!off) setS({ empty: true }); return; }
        const t = await j(`/trilhas-app/api/tracks/${id}`);
        const flat = t.chapters.flatMap((c) => c.lessons.map((l) => ({ ...l, chapter: c.title })));
        const done = p?.done?.[id] || {};
        const ymd = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const today = ymd(new Date());
        const yest = ymd(new Date(Date.now() - 864e5));
        if (!off) setS({
          id, title: t.title, total: flat.length, doneN: flat.filter((l) => done[l.id]).length,
          next: flat.find((l) => !done[l.id]) || null,
          streak: p && (p.lastDay === today || p.lastDay === yest) ? p.streak : 0,
          xp: p?.xp || 0, today: p?.days?.[today] || 0,
        });
      } catch { if (!off) setS({ error: true }); }
    })();
    return () => { off = true; };
  }, [tick]);

  const goal = 50;
  return (
    <Card id="trilhas" icon={Compass} tint="#7c5cff" title="Trilhas" href="/trilhas" hrefLabel="Abrir" edit={edit}>
      {!s && <div className="hm-loading" aria-busy="true" />}
      {s?.error && <Empty>Trilhas indisponível no momento.</Empty>}
      {s?.empty && <Empty>Nenhuma trilha ainda. Abra o Trilhas para começar.</Empty>}
      {s?.title && (
        <div className="hm-scroll">
          <div className="hm-tr-stats">
            <span className="hm-tr-stat fire"><Flame size={14} strokeWidth={2.4} />{s.streak} {s.streak === 1 ? "dia" : "dias"}</span>
            <span className="hm-tr-stat"><Target size={14} strokeWidth={2.4} />{Math.min(s.today, goal)}/{goal} XP hoje</span>
          </div>
          <p className="hm-sec">{s.title} · {s.doneN}/{s.total} lições</p>
          <div className="hm-bar"><i style={{ width: `${s.total ? (s.doneN / s.total) * 100 : 0}%` }} /></div>
          {s.next ? (
            <Link href={`/trilhas#/t/${s.id}/${s.next.id}`} className="hm-link hm-tr-next">
              <span className="hm-grow"><span className="hm-row-title">{s.next.title}</span><span className="hm-row-sub">{s.next.chapter}</span></span>
              <span className="hm-tr-go">Continuar<ChevronRight size={14} /></span>
            </Link>
          ) : <Empty>Trilha concluída. Que tal criar outra?</Empty>}
        </div>
      )}
    </Card>
  );
}
// ---------------------------------------------------------------- tela

export default function HomeDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/home", { cache: "no-store" });
      if (!r.ok) throw new Error("Falha ao carregar.");
      setData(await r.json());
      setError(null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive(["tasks", "finance", "agenda", "home", "estudos", "reconnect"], () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(load, 250);
  });
  useEffect(() => { const t = setInterval(load, 60_000); return () => clearInterval(t); }, [load]);

  async function saveLayout(layout) {
    setData((d) => ({ ...d, layout }));
    try { await post("/api/home", { op: "saveLayout", layout }); } catch { load(); }
  }
  const move = (idx, dir) => {
    const l = [...data.layout]; const j = idx + dir;
    if (j < 0 || j >= l.length) return;
    [l[idx], l[j]] = [l[j], l[idx]];
    saveLayout(l);
  };
  const toggle = (idx) => saveLayout(data.layout.map((x, i) => (i === idx ? { ...x, visible: !x.visible } : x)));

  const hour = new Date().getHours();
  const greeting = hour < 5 ? "Boa madrugada" : hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  if (!data) return <div className="home"><div className="home-inner">{error ? <p className="hm-empty">{error}</p> : <div className="hm-loading" aria-busy="true" />}</div></div>;

  const render = (id) => {
    switch (id) {
      case "clock": return <ClockWidget greeting={greeting} />;
      case "phrase": return <PhraseWidget phrase={data.phrase} />;
      case "tasks": return <TasksWidget data={data.tasks} reload={load} edit={edit} />;
      case "bills": return <BillsWidget data={data.bills} edit={edit} />;
      case "studies": return <StudiesWidget data={data.studies} edit={edit} />;
      case "goals": return <GoalsWidget goals={data.goals} reload={load} edit={edit} />;
      case "progress": return <ProgressWidget tasks={data.tasks} studies={data.studies} goals={data.goals} />;
      case "agenda": return <AgendaWidget data={data.agenda} edit={edit} />;
      case "usage": return <UsageWidget />;
      case "trilhas": return <TrilhasWidget edit={edit} />;
      case "news": return <NewsWidget />;
      default: return null;
    }
  };

  return (
    <div className="home">
      <div className="home-inner">
        <div className="home-toolbar">
          <button type="button" className={`hm-btn${edit ? " on" : ""}`} onClick={() => setEdit((v) => !v)}>
            <SlidersHorizontal size={15} />{edit ? "Concluir" : "Personalizar"}
          </button>
        </div>
        <div className={`home-grid${edit ? " editing" : ""}`}>
          {data.layout.map((l, idx) => {
            if (l.id === "trilhas" && process.env.NEXT_PUBLIC_LIFEHUB_TRILHAS === "0") return null;
            if (!l.visible && !edit) return null;
            return (
              <div key={l.id} className={`hm-slot span-${SPAN[l.id]}${l.visible ? "" : " is-hidden"}`}>
                {render(l.id)}
                {edit && (
                  <div className="hm-edit-bar">
                    <span>{WIDGET_LABEL[l.id]}</span>
                    <button type="button" aria-label="Mover para trás" disabled={idx === 0} onClick={() => move(idx, -1)}><ChevronUp size={15} /></button>
                    <button type="button" aria-label="Mover para frente" disabled={idx === data.layout.length - 1} onClick={() => move(idx, 1)}><ChevronDown size={15} /></button>
                    <button type="button" aria-label={l.visible ? "Ocultar" : "Mostrar"} onClick={() => toggle(idx)}>{l.visible ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
