"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Repeat, CalendarClock, Wand2, ArrowLeftRight } from "lucide-react";
import BrandAvatar from "./BrandAvatar.jsx";
import { Inline, Toggle, Pick } from "./FxParts.jsx";
import { brl, dm, pct, todayISO } from "./fx.js";

const KINDS = { fixed: { title: "Contas fixas", hint: "Aluguel, faculdade, celular, transporte...", add: "Nova conta fixa" }, subscription: { title: "Assinaturas", hint: "Spotify, Claude, Google One...", add: "Nova assinatura" } };

function NewRow({ kind, categories, accounts, onCreate, onCancel, defaults = {} }) {
  const [f, setF] = useState({ name: defaults.name || "", amount: defaults.amount || "", dayOfMonth: defaults.dayOfMonth || 1, categoryId: defaults.categoryId || "", accountId: defaults.accountId || "" });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const ok = f.name.trim() && Number(String(f.amount).replace(",", ".")) > 0;
  return (
    <form className="fx-newrow" onSubmit={(e) => { e.preventDefault(); if (ok) onCreate({ kind, ...f, amount: Number(String(f.amount).replace(",", ".")) }); }}>
      <input autoFocus placeholder="Nome" value={f.name} onChange={(e) => set("name", e.target.value)} />
      <input placeholder="Valor" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value)} />
      <input placeholder="Dia" type="number" min="1" max="28" value={f.dayOfMonth} onChange={(e) => set("dayOfMonth", e.target.value)} />
      <Pick value={f.categoryId} onChange={(v) => set("categoryId", v || "")} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="Categoria" />
      <Pick value={f.accountId} onChange={(v) => set("accountId", v || "")} options={accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Cobra em" />
      <span className="fx-newrow-actions">
        <button type="submit" className="fx-btn primary" disabled={!ok}>Salvar</button>
        <button type="button" className="fx-btn" onClick={onCancel}>Cancelar</button>
      </span>
    </form>
  );
}

function Row({ sub, categories, accounts, next, onPatch, onDelete }) {
  const cat = categories.find((c) => c.id === sub.categoryId);
  return (
    <li className={`fx-rec${sub.active ? "" : " off"}`}>
      <BrandAvatar name={sub.name} fallbackName={cat?.name} />
      <div className="fx-rec-main">
        <Inline value={sub.name} onSave={(v) => onPatch(sub.id, { name: v })} className="fx-rec-name" kind="text" />
        <span className="fx-rec-meta">
          dia <Inline value={sub.dayOfMonth} kind="day" onSave={(v) => onPatch(sub.id, { dayOfMonth: v })} />
          {" · "}
          <Pick value={sub.categoryId} onChange={(v) => onPatch(sub.id, { categoryId: v })} options={categories.map((c) => ({ value: c.id, label: c.name }))} placeholder="categoria" className="mini" />
          {" · "}
          <Pick value={sub.accountId} onChange={(v) => onPatch(sub.id, { accountId: v })} options={accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="cobra em..." className="mini" />
          {" · paga para "}
          <Inline value={sub.payee || ""} placeholder="favorecido no extrato" onSave={(v) => onPatch(sub.id, { payee: v })} width={150} />
        </span>
      </div>
      <div className="fx-rec-next">
        {sub.active ? (next ? <><CalendarClock size={13} /> {dm(next.dueDate)}</> : <em>sem próxima</em>) : <em>desativada{sub.cancelledAt ? ` em ${dm(sub.cancelledAt)}` : ""}</em>}
      </div>
      <div className="fx-rec-amount"><Inline value={sub.amount} kind="money" prefix="R$ " onSave={(v) => onPatch(sub.id, { amount: v })} /></div>
      <button type="button" className="fx-icon" title={sub.kind === "fixed" ? "Mover para assinaturas" : "Mover para contas fixas"} onClick={() => onPatch(sub.id, { kind: sub.kind === "fixed" ? "subscription" : "fixed" })}><ArrowLeftRight size={15} /></button>
      <Toggle on={sub.active} label={sub.active ? "Desligar" : "Ligar"} onChange={(v) => onPatch(sub.id, { active: v })} />
      <button type="button" className="fx-icon danger" title="Excluir" onClick={() => { if (confirm(`Excluir "${sub.name}"? As contas futuras não pagas dela somem.`)) onDelete(sub.id); }}><Trash2 size={15} /></button>
    </li>
  );
}

export default function FxRecurring({ data, A, onPatch, onCreate, onDelete }) {
  const [adding, setAdding] = useState(null); // "fixed" | "subscription" | {kind, defaults}
  const [showOff, setShowOff] = useState(false);
  const today = todayISO();
  const subs = data.subscriptions || [];
  const nextOf = useMemo(() => {
    const m = new Map();
    for (const b of (data.bills || []).filter((x) => !x.archived && x.status !== "paid" && x.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))) if (!m.has(b.seriesId)) m.set(b.seriesId, b);
    return m;
  }, [data.bills, today]);
  const kindOf = (s) => (s.kind === "fixed" ? "fixed" : "subscription");
  const active = subs.filter((s) => s.active), off = subs.filter((s) => !s.active);
  const income = A.current.avgIncome;
  const total = A.recurring.total;
  const catOpts = data.categories, accOpts = data.accounts.filter((a) => !a.archived);
  const annual = total * 12;

  return (
    <div className="fx-stack-v">
      <div className="fx-kpis three">
        <div className="fx-card kpi"><span className="fx-k-lab"><Repeat size={14} /> Contas fixas</span><strong>{brl(A.recurring.fixed)}</strong><span className="fx-k-sub">por mês</span></div>
        <div className="fx-card kpi"><span className="fx-k-lab"><Repeat size={14} /> Assinaturas</span><strong>{brl(A.recurring.subs)}</strong><span className="fx-k-sub">por mês</span></div>
        <div className="fx-card kpi accent"><span className="fx-k-lab">Peso fixo total</span><strong>{brl(total)}</strong><span className="fx-k-sub">{income > 0 ? `${pct(total / income)} da renda média` : "por mês"} · {brl(annual)}/ano</span></div>
      </div>

      {["fixed", "subscription"].map((kind) => {
        const list = active.filter((s) => kindOf(s) === kind).sort((a, b) => a.dayOfMonth - b.dayOfMonth || b.amount - a.amount);
        const sectionTotal = list.reduce((s, x) => s + x.amount, 0);
        return (
          <section className="fx-card" key={kind}>
            <header className="fx-card-head">
              <div><h2>{KINDS[kind].title}</h2><p className="fx-hint">{KINDS[kind].hint} · {list.length} ativa(s) · {brl(sectionTotal)}/mês</p></div>
              <button type="button" className="fx-btn" onClick={() => setAdding(kind)}><Plus size={14} /> {KINDS[kind].add}</button>
            </header>
            {adding === kind || (adding && adding.kind === kind) ? (
              <NewRow kind={kind} defaults={adding.defaults} categories={catOpts} accounts={accOpts} onCancel={() => setAdding(null)} onCreate={(v) => { onCreate(v); setAdding(null); }} />
            ) : null}
            {list.length === 0 ? <p className="fx-empty">Nada cadastrado ainda.</p> : (
              <ul className="fx-rec-list">
                {list.map((s) => <Row key={s.id} sub={s} categories={catOpts} accounts={accOpts} next={nextOf.get(s.seriesId)} onPatch={onPatch} onDelete={onDelete} />)}
              </ul>
            )}
          </section>
        );
      })}

      {A.detected.length > 0 && (
        <section className="fx-card">
          <header className="fx-card-head">
            <div><h2><Wand2 size={16} /> Parecem fixos e não estão cadastrados</h2><p className="fx-hint">Aparecem todo mês com valor parecido. Um clique cadastra e já entra na previsão.</p></div>
          </header>
          <ul className="fx-rec-list">
            {A.detected.map((d) => (
              <li className="fx-rec" key={d.key}>
                <BrandAvatar name={d.name} fallbackName={data.categories.find((c) => c.id === d.categoryId)?.name} />
                <div className="fx-rec-main"><span className="fx-rec-name static">{d.name}</span><span className="fx-rec-meta">{d.months} meses seguidos · última em {dm(d.last)}</span></div>
                <div className="fx-rec-amount">{brl(d.avg)}</div>
                <button type="button" className="fx-btn" onClick={() => onCreate({ kind: "fixed", name: d.name, amount: d.avg, dayOfMonth: Number(d.last.slice(8, 10)), categoryId: d.categoryId, accountId: d.accountId })}>Cadastrar como fixa</button>
                <button type="button" className="fx-btn" onClick={() => onCreate({ kind: "subscription", name: d.name, amount: d.avg, dayOfMonth: Number(d.last.slice(8, 10)), categoryId: d.categoryId, accountId: d.accountId })}>Como assinatura</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {off.length > 0 && (
        <section className="fx-card">
          <header className="fx-card-head">
            <div><h2>Desativadas</h2><p className="fx-hint">{off.length} fora da previsão. Ligue de novo quando voltar a pagar.</p></div>
            <button type="button" className="fx-btn" onClick={() => setShowOff((v) => !v)}>{showOff ? "Esconder" : "Mostrar"}</button>
          </header>
          {showOff && <ul className="fx-rec-list">{off.map((s) => <Row key={s.id} sub={s} categories={catOpts} accounts={accOpts} next={null} onPatch={onPatch} onDelete={onDelete} />)}</ul>}
        </section>
      )}
    </div>
  );
}
