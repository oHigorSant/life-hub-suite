"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, TrendingUp, TrendingDown, Wallet, CreditCard, Check, Search, Plus, ChevronRight } from "lucide-react";
import BrandAvatar from "./BrandAvatar.jsx";
import { Inline, Segmented, Pick, Spark, FlowBars, HBars, Donut, StackBars } from "./FxParts.jsx";
import { brl, brl0, dm, pct, monthLabel, monthShort, todayISO, ACCOUNT_TYPE_LABELS } from "./fx.js";
import { categoryColor } from "@/lib/financeBrand";
import { addDaysISO, addMonths, ymOf } from "@/lib/finance/analytics.js";
import { suggestPayees, rulesOf } from "@/lib/finance/reconcile.js";

const TONE_ICON = { bad: AlertTriangle, warn: AlertTriangle, good: CheckCircle2, info: Info };
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function Insight({ i }) {
  const Icon = TONE_ICON[i.tone] || Info;
  return <li className={`fx-insight ${i.tone}`}><Icon size={18} /><div><b>{i.title}</b><p>{i.text}</p></div></li>;
}

/** Anel da nota de saúde (0-100) com degradê e número no centro. */
function ScoreRing({ score, tone }) {
  const size = 132, stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const id = `g-${tone}`;
  const colors = { good: ["#34c759", "#30d5c8"], warn: ["#ff9f0a", "#ffd60a"], bad: ["#ff3b30", "#ff6a5e"] }[tone];
  return (
    <svg className="fx-ring" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Nota ${score} de 100`}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={colors[0]} /><stop offset="1" stopColor={colors[1]} /></linearGradient></defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,.07)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="fx-ring-arc" />
      <text x="50%" y="52%" textAnchor="middle" className="fx-ring-n">{score}</text>
      <text x="50%" y="68%" textAnchor="middle" className="fx-ring-l">de 100</text>
    </svg>
  );
}

function Delta({ v }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="fx-delta flat">novo</span>;
  const up = v > 0.03, down = v < -0.03;
  return <span className={`fx-delta ${up ? "up" : down ? "down" : "flat"}`}>{up ? <TrendingUp size={12} /> : down ? <TrendingDown size={12} /> : null}{up ? "+" : down ? "−" : ""}{pct(Math.abs(v))}</span>;
}

/** Contas em aberto com o atraso calculado hoje; vencidas antigas ficam no topo. */
export function openBillsOf(data, today = todayISO()) {
  return (data.bills || []).filter((b) => !b.archived && b.status !== "paid" && !b.hideFromForecast)
    .map((b) => (b.dueDate < today ? { ...b, status: "overdue" } : b)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function BillRow({ bill, cat, onToggle, onEdit, selected, onSelect }) {
  const paid = bill.status === "paid";
  return (
    <li className={`fx-bill${bill.status === "overdue" ? " late" : ""}${paid ? " paid" : ""}`}>
      {onSelect ? <input type="checkbox" className="fx-sel" checked={!!selected} onChange={() => onSelect(bill.id)} aria-label="Selecionar" /> : null}
      <button type="button" className={`fx-check${paid ? " on" : ""}`} onClick={() => onToggle(bill)} aria-label={paid ? "Desmarcar pagamento" : "Marcar como paga"}>{paid ? <Check size={14} strokeWidth={3} /> : null}</button>
      <BrandAvatar name={bill.name} fallbackName={cat?.name} size="sm" />
      <div className="fx-bill-main">
        <span className="fx-bill-name">{bill.name}</span>
        <span className="fx-bill-meta">{bill.status === "overdue" ? "venceu " : paid ? "venc. " : "vence "}{dm(bill.dueDate)}{paid && bill.paidAt ? ` · pago em ${dm(bill.paidAt)}${bill.paidBy ? " (banco)" : ""}${bill.paidAmount && Math.abs(bill.paidAmount - bill.amount) > 0.01 ? ` · ${brl(bill.paidAmount)}` : ""}` : ""}{bill.installment ? ` · parcela ${bill.installment.number}/${bill.installment.total}` : ""}{cat ? ` · ${cat.name}` : ""}{bill.source === "openfinance" ? " · do banco" : ""}</span>
      </div>
      <b className="fx-bill-amount">{onEdit && !paid ? <Inline value={bill.amount} kind="money" prefix="R$ " onSave={(v) => onEdit(bill, { amount: v })} /> : brl(bill.amount)}</b>
    </li>
  );
}

/* ====================================================== VISÃO GERAL ====================================================== */
export function Overview({ data, A, onToggleBill, goTab, onPickMonth }) {
  const today = todayISO();
  const open = useMemo(() => openBillsOf(data, today), [data, today]);
  const soon = open.filter((b) => b.status === "overdue" || b.dueDate <= addDaysISO(today, 10)).slice(0, 8);
  const c = A.current;
  const paceVsAvg = c.avgSpend3 > 0 ? (c.projected - c.avgSpend3) / c.avgSpend3 : null;
  const catRows = A.categories.slice(0, 7);
  const donut = [...A.categories.slice(0, 6).map((x) => ({ key: x.id, value: x.current, color: categoryColor(x.name) }))];
  const rest = A.categories.slice(6).reduce((s, x) => s + x.current, 0);
  if (rest > 0) donut.push({ key: "rest", value: rest, color: "#c7c7cc" });
  return (
    <div className="fx-stack-v">
      <section className={`fx-hero ${A.health.tone}`}>
        <div className="fx-hero-score">
          <ScoreRing score={A.health.score} tone={A.health.tone} />
          <span className="fx-hero-label">{A.health.label}</span>
        </div>
        <div className="fx-hero-main">
          <p className="fx-hero-eyebrow">Saúde financeira · {monthLabel(c.key).split(" ")[0]}</p>
          <h2>{A.health.headline}</h2>
          <p className="fx-hero-sub">{A.health.sub}</p>
          <dl className="fx-hero-stats">
            <div><dt><Wallet size={13} /> Nas contas</dt><dd>{brl0(A.cash.liquid)}</dd></div>
            <div><dt>A pagar em 30 dias</dt><dd>{brl0(A.cash.due30)}</dd></div>
            <div className={A.cash.overdue > 0 ? "bad" : ""}><dt>Atrasado</dt><dd>{brl0(A.cash.overdue)}</dd></div>
            <div><dt>Gasto no mês</dt><dd>{brl0(c.spent)}{paceVsAvg !== null ? <Delta v={paceVsAvg} /> : null}</dd></div>
          </dl>
        </div>
      </section>

      <section className="fx-card">
        <header className="fx-card-head"><div><h2>O que fazer agora</h2><p className="fx-hint">Em ordem de prioridade</p></div></header>
        <ul className="fx-actions-list">
          {A.actions.map((a) => {
            const Icon = TONE_ICON[a.tone] || Info;
            return (
              <li key={a.key} className={a.tone}>
                <span className="fx-act-ico"><Icon size={18} /></span>
                <div className="fx-act-body"><b>{a.title}</b><p>{a.text}</p></div>
                {a.cta ? <button type="button" className="fx-btn" onClick={() => goTab(a.tab)}>{a.cta}<ChevronRight size={14} /></button> : null}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="fx-signals">
        {A.signals.map((s) => (
          <div key={s.key} className={`fx-signal ${s.tone}`}>
            <span className="fx-sig-lab">{s.label}</span>
            <strong>{s.value}</strong>
            <span className="fx-sig-sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="fx-two">
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Entrou x saiu</h2><p className="fx-hint">12 meses · linha tracejada é a média de gasto</p></div><div className="fx-legend"><span><i className="inc" />Entrou</span><span><i className="out" />Saiu</span></div></header>
          <FlowBars series={A.series} active={c.key} />
        </section>
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Para onde foi em {monthLabel(c.key).split(" ")[0].toLowerCase()}</h2><p className="fx-hint">{brl(c.spent)} em {A.series[A.series.length - 1].count} lançamentos</p></div></header>
          {catRows.length === 0 ? <p className="fx-empty">Sem gastos neste mês ainda.</p> : (
            <div className="fx-donut-row">
              <Donut slices={donut} total={c.spent} center={{ label: "Total", value: brl0(c.spent) }} />
              <ul className="fx-legend-list">{catRows.map((x) => <li key={x.id}><i style={{ background: categoryColor(x.name) }} /><span>{x.name}</span><em>{pct(x.share)}</em><b>{brl0(x.current)}</b></li>)}</ul>
            </div>
          )}
        </section>
      </div>

      <div className="fx-two">
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Próximos vencimentos</h2><p className="fx-hint">Atrasadas e as dos próximos 10 dias</p></div><button type="button" className="fx-btn" onClick={() => goTab("bills")}>Ver todas</button></header>
          {soon.length === 0 ? <p className="fx-empty">Nada vencendo agora.</p> : <ul className="fx-bills">{soon.map((b) => <BillRow key={b.id} bill={b} cat={data.categories.find((x) => x.id === b.categoryId)} onToggle={onToggleBill} />)}</ul>}
        </section>
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Cartões</h2><p className="fx-hint">Limite usado e vencimento</p></div><button type="button" className="fx-btn" onClick={() => goTab("accounts")}>Contas</button></header>
          {A.cards.length === 0 ? <p className="fx-empty">Nenhum cartão.</p> : (
            <ul className="fx-cards">
              {A.cards.map((k) => (
                <li key={k.id}>
                  <BrandAvatar name={k.name} size="sm" />
                  <div className="fx-grow"><span className="fx-bill-name">{k.name}</span>
                    <span className="fx-meter thin"><i className={k.usedPct > 0.8 ? "hot" : ""} style={{ width: `${(k.usedPct ?? 0) * 100}%` }} /></span>
                    <span className="fx-bill-meta">{k.limit ? `${pct(k.usedPct)} de ${brl0(k.limit)}` : "limite não informado"}{k.dueDate ? ` · vence ${dm(String(k.dueDate).slice(0, 10))}` : ""}</span>
                  </div>
                  <b>{brl(k.used)}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/* ====================================================== CONTAS A PAGAR ====================================================== */
/** Liga cada conta ao favorecido do extrato; com o vínculo, as contas são baixadas com a data e o valor reais do banco. */
function Reconcile({ data, onReconcile }) {
  const today = todayISO();
  const sugg = useMemo(() => suggestPayees(data, today), [data, today]);
  const rules = useMemo(() => [...rulesOf(data).entries()].map(([seriesId, r]) => ({ seriesId, keyword: r.keyword, name: (data.bills.find((b) => b.seriesId === seriesId) || {}).name || seriesId })), [data]);
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState({});
  if (!sugg.length && !rules.length) return null;
  const kw = (s) => draft[s.seriesId] ?? s.keyword;
  return (
    <section className="fx-card">
      <header className="fx-card-head">
        <div><h2>Conciliar com o banco</h2><p className="fx-hint">{sugg.length ? `${sugg.length} conta(s) ainda sem o favorecido do extrato. Vinculando, cada mês é baixado sozinho com a data e o valor reais do pagamento.` : "Tudo vinculado. Os vínculos abaixo baixam as contas a cada sincronização."}</p></div>
        <div className="fx-actions">
          <button type="button" className="fx-btn" onClick={() => setOpen((v) => !v)}>{open ? "Recolher" : "Abrir"}</button>
        </div>
      </header>
      {open && (
        <>
          {sugg.length > 0 && <ul className="fx-recon">
            {sugg.map((s) => (
              <li key={s.seriesId}>
                <BrandAvatar name={s.name} size="sm" />
                <div className="fx-recon-main">
                  <b>{s.name}</b>
                  <span className="fx-bill-meta">paga para <input className="fx-recon-kw" value={kw(s)} onChange={(e) => setDraft((p) => ({ ...p, [s.seriesId]: e.target.value }))} aria-label="Nome do favorecido no extrato" /> · bate em {s.hits} de {s.of}</span>
                  <span className="fx-bill-meta">{s.examples.map((x) => `${dm(x.due)} → ${dm(x.date)} ${brl(x.amount)}`).join("  ·  ")}</span>
                </div>
                <button type="button" className="fx-btn primary" onClick={() => onReconcile({ op: "link", seriesId: s.seriesId, keyword: kw(s) }, "Vinculado e baixado pelo banco")}>Vincular</button>
                <button type="button" className="fx-btn" onClick={() => onReconcile({ op: "ignore", seriesId: s.seriesId })}>Não é</button>
              </li>
            ))}
          </ul>}
          {rules.length > 0 && <>
            <h3 className="fx-h3">Vínculos ativos</h3>
            <ul className="fx-recon linked">{rules.map((r) => (
              <li key={r.seriesId}><BrandAvatar name={r.name} size="sm" /><div className="fx-recon-main"><b>{r.name}</b><span className="fx-bill-meta">paga para <b>{r.keyword}</b></span></div>
                <button type="button" className="fx-btn" onClick={() => onReconcile({ op: "unlink", seriesId: r.seriesId })}>Desvincular</button></li>
            ))}</ul>
          </>}
        </>
      )}
    </section>
  );
}

export function Bills({ data, onToggleBill, onEditBill, onBulk, onReconcile }) {
  const today = todayISO();
  const [showPaid, setShowPaid] = useState(false);
  const [sel, setSel] = useState(new Set());
  const [month, setMonth] = useState(ymOf(today));
  const all = useMemo(() => (data.bills || []).filter((b) => !b.archived && !b.hideFromForecast).map((b) => (b.status !== "paid" && b.dueDate < today ? { ...b, status: "overdue" } : b)), [data.bills, today]);
  const months = useMemo(() => {
    const set = new Set([ymOf(today)]);
    for (const b of all) if (b.status !== "paid" && b.dueDate >= today) set.add(ymOf(b.dueDate));
    return [...set].sort().map((k) => ({ key: k, total: all.filter((b) => b.status !== "paid" && (b.status === "overdue" && b.dueDate < ymOf(today) + "-01" ? k === ymOf(today) : ymOf(b.dueDate) === k)).reduce((s, b) => s + b.amount, 0) }));
  }, [all, today]);
  const inMonth = all.filter((b) => (b.status === "overdue" && b.dueDate < ymOf(today) + "-01" ? month === ymOf(today) : ymOf(b.dueDate) === month));
  const overdue = inMonth.filter((b) => b.status === "overdue").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pending = inMonth.filter((b) => b.status === "pending").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = inMonth.filter((b) => b.status === "paid").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const openTotal = [...overdue, ...pending].reduce((s, b) => s + b.amount, 0);
  const paidTotal = paid.reduce((s, b) => s + b.amount, 0);
  const catOf = (b) => data.categories.find((x) => x.id === b.categoryId);
  const toggleSel = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selTotal = [...overdue, ...pending].filter((b) => sel.has(b.id)).reduce((s, b) => s + b.amount, 0);
  const fixedIds = new Set((data.subscriptions || []).filter((s) => s.kind === "fixed").map((s) => s.seriesId));
  const fixedOpen = [...overdue, ...pending].filter((b) => fixedIds.has(b.seriesId));
  const group = (title, list, tone) => list.length ? (
    <section className="fx-card" key={title}>
      <header className="fx-card-head"><div><h2 className={tone}>{title}</h2><p className="fx-hint">{list.length} conta(s) · {brl(list.reduce((s, b) => s + b.amount, 0))}</p></div></header>
      <ul className="fx-bills">{list.map((b) => <BillRow key={b.id} bill={b} cat={catOf(b)} onToggle={onToggleBill} onEdit={onEditBill} selected={sel.has(b.id)} onSelect={b.status !== "paid" ? toggleSel : null} />)}</ul>
    </section>
  ) : null;
  return (
    <div className="fx-stack-v">
      <div className="fx-monthbar">
        <Segmented value={month} onChange={(v) => { setMonth(v); setSel(new Set()); }} options={months.map((m) => ({ value: m.key, label: monthShort(m.key), badge: brl0(m.total).replace("R$", "").trim() }))} />
        <div className="fx-actions">
          {fixedOpen.length > 0 && <button type="button" className="fx-btn" onClick={() => onBulk(fixedOpen.map((b) => b.id), "paid")}>Pagar todas as fixas ({fixedOpen.length})</button>}
          <button type="button" className="fx-btn" onClick={() => setShowPaid((v) => !v)}>{showPaid ? "Esconder pagas" : `Ver pagas (${paid.length})`}</button>
        </div>
      </div>
      <div className="fx-kpis three">
        <div className="fx-card kpi"><span className="fx-k-lab">{monthLabel(month)}</span><strong>{brl(openTotal)}</strong><span className="fx-k-sub">ainda a pagar</span></div>
        <div className="fx-card kpi"><span className="fx-k-lab">Já pago</span><strong>{brl(paidTotal)}</strong><span className="fx-k-sub">{paid.length} conta(s)</span></div>
        <div className="fx-card kpi"><span className="fx-k-lab">Progresso</span><strong>{pct(openTotal + paidTotal > 0 ? paidTotal / (openTotal + paidTotal) : 0)}</strong><span className="fx-meter"><i style={{ width: `${openTotal + paidTotal > 0 ? (paidTotal / (openTotal + paidTotal)) * 100 : 0}%` }} /></span></div>
      </div>
      <Reconcile data={data} onReconcile={onReconcile} />
      {sel.size > 0 && (
        <div className="fx-selbar"><b>{sel.size}</b> selecionada(s) · {brl(selTotal)}
          <button type="button" className="fx-btn primary" onClick={() => { onBulk([...sel], "paid"); setSel(new Set()); }}>Marcar como pagas</button>
          <button type="button" className="fx-btn" onClick={() => setSel(new Set())}>Limpar</button></div>
      )}
      {group("Atrasadas", overdue, "late")}
      {group("A vencer", pending)}
      {showPaid && group("Pagas", paid)}
      {overdue.length + pending.length === 0 && <div className="fx-card"><p className="fx-empty">Tudo pago em {monthLabel(month)}.</p></div>}
    </div>
  );
}

/* ====================================================== ANÁLISE ====================================================== */
export function Analysis({ data, A }) {
  const last6 = A.series.slice(-6);
  const maxW = Math.max(...A.weekday, 1);
  const totalThirds = A.monthThirds.reduce((s, x) => s + x, 0) || 1;
  const COLORS = { cards: "#af52de", fixed: "#0a84ff", subs: "#ff9f0a", debts: "#ff3b30", other: "#8e8e93" };
  const PARTS = [{ key: "cards", color: COLORS.cards }, { key: "fixed", color: COLORS.fixed }, { key: "subs", color: COLORS.subs }, { key: "debts", color: COLORS.debts }, { key: "other", color: COLORS.other }];
  return (
    <div className="fx-stack-v">
      <section className="fx-card">
        <header className="fx-card-head"><div><h2>Leitura completa</h2><p className="fx-hint">Tudo que os números sugerem, do mais ao menos importante</p></div></header>
        <ul className="fx-insights compact">{A.insights.map((i, k) => <Insight key={k} i={i} />)}</ul>
      </section>
      <section className="fx-card">
        <header className="fx-card-head"><div><h2>Mês a mês</h2><p className="fx-hint">Entrou, saiu e quanto sobrou. Transferências e pagamento de fatura não contam.</p></div></header>
        <div className="fx-table-wrap"><table className="fx-table">
          <thead><tr><th>Mês</th><th>Entrou</th><th>Saiu</th><th>Saldo</th><th>Taxa de poupança</th><th>Maior categoria</th></tr></thead>
          <tbody>{last6.slice().reverse().map((m) => {
            const top = [...m.cats.entries()].sort((a, b) => b[1] - a[1])[0];
            const rate = m.income > 0 ? (m.income - m.spend) / m.income : null;
            return <tr key={m.key}><td>{monthLabel(m.key)}</td><td>{brl(m.income)}</td><td>{brl(m.spend)}</td><td className={m.net >= 0 ? "pos" : "neg"}>{brl(m.net)}</td><td>{rate === null ? "—" : <span className={rate >= 0.1 ? "pos" : rate < 0 ? "neg" : ""}>{pct(rate)}</span>}</td><td>{top ? `${(data.categories.find((c) => c.id === top[0]) || {}).name || "—"} · ${brl0(top[1])}` : "—"}</td></tr>;
          })}</tbody>
        </table></div>
      </section>

      <section className="fx-card">
        <header className="fx-card-head"><div><h2>Categorias: este mês, mês passado e a média</h2><p className="fx-hint">A seta compara este mês com a média dos 3 anteriores. O gráfico mostra os últimos 6 meses.</p></div></header>
        <div className="fx-table-wrap"><table className="fx-table">
          <thead><tr><th>Categoria</th><th>Este mês</th><th>Mês passado</th><th>Média 3m</th><th>Variação</th><th>6 meses</th></tr></thead>
          <tbody>{A.categories.slice(0, 12).map((c) => (
            <tr key={c.id}><td><span className="fx-dot" style={{ background: categoryColor(c.name) }} />{c.name}</td><td><b>{brl(c.current)}</b></td><td>{brl(c.previous)}</td><td>{brl(c.avg3)}</td><td><Delta v={c.deltaVsAvg} /></td><td><Spark data={c.trend} color={categoryColor(c.name)} /></td></tr>
          ))}</tbody>
        </table></div>
      </section>

      <div className="fx-two">
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Onde mais saiu dinheiro</h2><p className="fx-hint">Por estabelecimento, últimos 90 dias</p></div></header>
          <HBars rows={A.merchants.map((m) => ({ key: m.key, label: m.name, value: m.total, note: `${m.count} lançamento(s)` }))} />
        </section>
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Quando você gasta</h2><p className="fx-hint">Por dia da semana e por faixa do mês (90 dias)</p></div></header>
          <div className="fx-week">{A.weekday.map((v, i) => <div key={i} title={brl(v)}><span className="fx-week-bar"><i style={{ height: `${(v / maxW) * 100}%` }} /></span><em>{WEEK[i]}</em></div>)}</div>
          <ul className="fx-thirds">{["Dias 1 a 10", "Dias 11 a 20", "Dias 21 a 31"].map((l, i) => <li key={l}><span>{l}</span><span className="fx-hb-track"><i style={{ width: `${(A.monthThirds[i] / totalThirds) * 100}%` }} /></span><b>{pct(A.monthThirds[i] / totalThirds)}</b></li>)}</ul>
        </section>
      </div>

      <section className="fx-card">
        <header className="fx-card-head"><div><h2>Quanto já está comprometido nos próximos meses</h2><p className="fx-hint">Contas em aberto por mês, separadas por tipo</p></div>
          <div className="fx-legend">{[["Faturas", COLORS.cards], ["Fixas", COLORS.fixed], ["Assinaturas", COLORS.subs], ["Dívidas", COLORS.debts], ["Outras", COLORS.other]].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}</div></header>
        {A.commitments.length === 0 ? <p className="fx-empty">Nada em aberto.</p> : <StackBars rows={A.commitments} parts={PARTS} />}
      </section>

      <div className="fx-two">
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Dívidas e parcelas</h2><p className="fx-hint">{brl(A.debts.reduce((s, d) => s + d.remaining, 0))} restantes · {brl(A.debts.reduce((s, d) => s + d.perMonth, 0))} por mês</p></div></header>
          {A.debts.length === 0 ? <p className="fx-empty">Nenhuma dívida em andamento.</p> : <ul className="fx-bills">{A.debts.map((d) => (
            <li key={d.name} className="fx-bill"><BrandAvatar name={d.name} fallbackName={d.category} size="sm" /><div className="fx-bill-main"><span className="fx-bill-name">{d.name}</span><span className="fx-bill-meta">{d.count} pagamento(s) · termina em {dm(d.last)}/{d.last.slice(2, 4)}</span></div><b className="fx-bill-amount">{brl(d.remaining)}</b></li>
          ))}</ul>}
        </section>
        <section className="fx-card">
          <header className="fx-card-head"><div><h2>Pontos de atenção</h2><p className="fx-hint">Últimos 6 meses</p></div></header>
          <ul className="fx-facts">
            <li><span>Taxas, juros e IOF</span><b>{brl(A.fees.total)}</b><em>{A.fees.count} cobrança(s)</em></li>
            <li><span>Pix para terceiros</span><b>{brl(A.pix.total)}</b><em>{A.pix.count} Pix</em></li>
            {A.pix.top.map((p) => <li key={p.name} className="sub"><span>{p.name}</span><b>{brl(p.total)}</b></li>)}
          </ul>
          <h3 className="fx-h3">Maiores gastos (90 dias)</h3>
          <ul className="fx-facts">{A.biggest.map((t) => <li key={t.id} className="sub"><span>{t.description.slice(0, 30)} · {dm(t.date)}</span><b>{brl(t.amount)}</b></li>)}</ul>
        </section>
      </div>
    </div>
  );
}

/* ====================================================== LANÇAMENTOS ====================================================== */
export function Transactions({ data, onTxPatch, accountFilter, setAccountFilter, onAdd }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [month, setMonth] = useState("");
  const [type, setType] = useState("all");
  const [transfers, setTransfers] = useState(false);
  const [limit, setLimit] = useState(80);
  const months = useMemo(() => [...new Set(data.transactions.map((t) => ymOf(t.date)))].sort().reverse(), [data.transactions]);
  const rows = useMemo(() => {
    const nq = q.trim().toLowerCase();
    return data.transactions.filter((t) => !t.archived && (transfers || !t.transfer) && (!accountFilter || t.accountId === accountFilter) && (!cat || t.categoryId === cat) && (!month || ymOf(t.date) === month) && (type === "all" || t.type === type) && (!nq || String(t.description).toLowerCase().includes(nq))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [data.transactions, q, cat, month, type, transfers, accountFilter]);
  const out = rows.filter((t) => t.type === "expense" && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const inc = rows.filter((t) => t.type === "income" && !t.transfer).reduce((s, t) => s + t.amount, 0);
  const catOpts = data.categories.map((c) => ({ value: c.id, label: c.name }));
  const days = [];
  for (const t of rows.slice(0, limit)) { const last = days[days.length - 1]; if (last && last.date === t.date) last.items.push(t); else days.push({ date: t.date, items: [t] }); }
  return (
    <div className="fx-stack-v">
      <section className="fx-card">
        <div className="fx-filters">
          <label className="fx-search"><Search size={15} /><input placeholder="Buscar descrição" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <Pick value={accountFilter} onChange={setAccountFilter} options={data.accounts.map((a) => ({ value: a.id, label: a.name }))} placeholder="Todas as contas" />
          <Pick value={cat} onChange={(v) => setCat(v || "")} options={catOpts} placeholder="Todas as categorias" />
          <Pick value={month} onChange={(v) => setMonth(v || "")} options={months.map((m) => ({ value: m, label: monthLabel(m) }))} placeholder="Todos os meses" />
          <Segmented small value={type} onChange={setType} options={[{ value: "all", label: "Tudo" }, { value: "expense", label: "Saídas" }, { value: "income", label: "Entradas" }]} />
          <label className="fx-check-label"><input type="checkbox" checked={transfers} onChange={(e) => setTransfers(e.target.checked)} /> Mostrar transferências</label>
          <button type="button" className="fx-btn primary" onClick={onAdd}><Plus size={14} /> Lançar</button>
        </div>
        <p className="fx-hint pad">{rows.length} lançamento(s) · saídas {brl(out)} · entradas {brl(inc)}</p>
      </section>
      <section className="fx-card flush">
        {days.length === 0 ? <p className="fx-empty pad">Nada com esses filtros.</p> : days.map((d) => (
          <div key={d.date} className="fx-day">
            <h3>{new Date(`${d.date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</h3>
            <ul className="fx-txns">{d.items.map((t) => {
              const acc = data.accounts.find((a) => a.id === t.accountId); const c = data.categories.find((x) => x.id === t.categoryId);
              return (
                <li key={t.id} className={t.transfer ? "tr" : ""}>
                  <BrandAvatar name={t.description || c?.name || "?"} fallbackName={c?.name} size="sm" />
                  <div className="fx-bill-main"><span className="fx-bill-name">{t.description || c?.name || "Lançamento"}{t.pending ? <em className="fx-tag">pendente</em> : null}{t.transfer ? <em className="fx-tag">transferência</em> : null}</span>
                    <span className="fx-bill-meta">{acc?.name}{t.installment ? ` · ${t.installment.number}/${t.installment.total}` : ""}</span></div>
                  <Pick className="mini" value={t.categoryId} onChange={(v) => v && onTxPatch(t.id, { categoryId: v })} options={catOpts} placeholder="categoria" />
                  <button type="button" className="fx-icon" title={t.transfer ? "Contar como gasto/renda" : "Marcar como transferência (fora dos gastos)"} onClick={() => onTxPatch(t.id, { transfer: !t.transfer })}>{t.transfer ? "Contar" : "Transf."}</button>
                  <b className={`fx-amt ${t.type}${t.transfer ? " mute" : ""}`}>{t.type === "expense" ? "−" : "+"}{brl(t.amount)}</b>
                </li>
              );
            })}</ul>
          </div>
        ))}
        {rows.length > limit && <button type="button" className="fx-more" onClick={() => setLimit((l) => l + 120)}>Mostrar mais ({rows.length - limit})</button>}
      </section>
    </div>
  );
}

/* ====================================================== CONTAS ====================================================== */
export function Accounts({ data, A, onOpenAccount, onBanks, onOfx, onAddAccount }) {
  const accs = data.accounts.filter((a) => !a.archived);
  const liquid = accs.filter((a) => a.type !== "credit_card");
  const cards = accs.filter((a) => a.type === "credit_card");
  const cardInfo = (a) => A.cards.find((k) => k.id === a.id);
  const invoice = (a) => (data.bills || []).filter((b) => !b.archived && b.accountId === a.id && b.source === "openfinance" && b.status !== "paid").sort((x, y) => x.dueDate.localeCompare(y.dueDate))[0];
  return (
    <div className="fx-stack-v">
      <div className="fx-actions end">
        <button type="button" className="fx-btn" onClick={onBanks}>Conectar bancos</button>
        <button type="button" className="fx-btn" onClick={onOfx}>Importar OFX</button>
        <button type="button" className="fx-btn" onClick={onAddAccount}><Plus size={14} /> Conta</button>
      </div>
      <section className="fx-card">
        <header className="fx-card-head"><div><h2>Contas</h2><p className="fx-hint">{brl(liquid.reduce((s, a) => s + (Number(a.of?.balance ?? a.balance) || 0), 0))} no total</p></div></header>
        <ul className="fx-bills">{liquid.map((a) => (
          <li key={a.id} className="fx-bill click" onClick={() => onOpenAccount(a.id)}>
            <BrandAvatar name={a.name} fallbackColor={undefined} size="sm" />
            <div className="fx-bill-main"><span className="fx-bill-name">{a.name}</span><span className="fx-bill-meta">{ACCOUNT_TYPE_LABELS[a.type]}{a.of ? " · conectada ao banco" : " · manual"}</span></div>
            <b className="fx-bill-amount">{brl(Number(a.of?.balance ?? a.balance) || 0)}</b>
          </li>
        ))}</ul>
      </section>
      <section className="fx-card">
        <header className="fx-card-head"><div><h2><CreditCard size={16} /> Cartões</h2><p className="fx-hint">Limite, fatura atual e vencimento</p></div></header>
        <ul className="fx-cards big">{cards.map((a) => {
          const k = cardInfo(a); const inv = invoice(a);
          return (
            <li key={a.id} className="click" onClick={() => onOpenAccount(a.id)}>
              <BrandAvatar name={a.name} />
              <div className="fx-grow"><span className="fx-bill-name">{a.name}</span>
                <span className="fx-meter thin"><i className={k?.usedPct > 0.8 ? "hot" : ""} style={{ width: `${(k?.usedPct ?? 0) * 100}%` }} /></span>
                <span className="fx-bill-meta">{k?.limit ? `${brl0(k.used)} de ${brl0(k.limit)} · disponível ${brl0(k.available)}` : "sem limite informado"}</span>
                {inv ? <span className="fx-bill-meta">Próxima fatura {brl(inv.amount)} · vence {dm(inv.dueDate)}</span> : null}
              </div>
              <b>{brl(k?.used ?? 0)}</b>
            </li>
          );
        })}</ul>
      </section>
    </div>
  );
}
