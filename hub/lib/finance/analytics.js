// Análise do módulo de finanças: funções puras sobre finance.json (rodam no navegador e nos testes).
// Gasto = saída que não é transferência (pagamento de fatura, entre contas, aplicação). Renda = entrada que não é transferência.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);

export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export const ymOf = (iso) => String(iso).slice(0, 7);
export const addMonths = (ym, n) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const daysInMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const addDaysISO = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const todaySP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

/** Nome do estabelecimento sem ruído: "PIX ENVIADO ORLANDO PARDINI GA 123" -> "orlando pardini". */
export function merchantKey(description) {
  let s = norm(description)
    .replace(/\b(pix|ted|doc)\s+(enviado|recebido|enviada|recebida)(\s+(para|de))?\b/g, " ")
    .replace(/\b(pagamento|pagto|pgto|compra|debito|credito|boleto|no|na|de|do|da|em|via|aut|ext)\b/g, " ")
    .replace(/\b\d+(\/\d+)?\b/g, " ")
    .replace(/\s+/g, " ").trim();
  const w = s.split(" ").filter(Boolean).slice(0, 2);
  return w.join(" ") || "outros";
}

// descrições genéricas (boleto, saque, parcela...) não identificam um estabelecimento fixo
const GENERIC_RE = /bankslip|boleto|parcela paga|saque|fatura|\biof\b|juros|multa|tarifa|pix (enviado|para) (c6|nubank|picpay|btg|caixa)/;
const FEE_RE =/\biof\b|\bjuros\b|\bmulta\b|\btarifa\b|\bencargo|mora\b/;
const PIX_OUT_RE = /pix (enviado|para)|pix enviado para|transferencia enviada|ted enviada/;

function spendOf(data) {
  return data.transactions.filter((t) => !t.archived && !t.transfer && t.type === "expense");
}
function incomeOf(data) {
  return data.transactions.filter((t) => !t.archived && !t.transfer && t.type === "income");
}

/** Quanto foi gasto/recebido em cada um dos últimos `n` meses (o último é o mês de `now`). */
export function monthlySeries(data, now = todaySP(), n = 12) {
  const cur = ymOf(now);
  const keys = Array.from({ length: n }, (_, i) => addMonths(cur, i - (n - 1)));
  const by = new Map(keys.map((k) => [k, { key: k, spend: 0, income: 0, count: 0, cats: new Map() }]));
  for (const t of spendOf(data)) { const m = by.get(ymOf(t.date)); if (!m) continue; m.spend += t.amount; m.count++; m.cats.set(t.categoryId, (m.cats.get(t.categoryId) || 0) + t.amount); }
  for (const t of incomeOf(data)) { const m = by.get(ymOf(t.date)); if (m) m.income += t.amount; }
  return keys.map((k) => { const m = by.get(k); return { ...m, spend: round2(m.spend), income: round2(m.income), net: round2(m.income - m.spend) }; });
}

/** Lista unificada do que é recorrente (fixas e assinaturas cadastradas), com o que pesa por mês. */
export function recurringSummary(data) {
  const subs = (data.subscriptions || []).filter((s) => !s.archived);
  const active = subs.filter((s) => s.active);
  const fixed = active.filter((s) => (s.kind || "subscription") === "fixed");
  const subsOnly = active.filter((s) => (s.kind || "subscription") !== "fixed");
  return { fixed: round2(sum(fixed, (s) => s.amount)), subs: round2(sum(subsOnly, (s) => s.amount)), total: round2(sum(active, (s) => s.amount)), activeCount: active.length, inactiveCount: subs.length - active.length };
}

/** Gastos que se repetem todo mês (mesmo estabelecimento, valor parecido) e ainda não estão cadastrados como fixa/assinatura. */
export function detectRecurring(data, now = todaySP()) {
  const cur = ymOf(now);
  const window = [addMonths(cur, -3), addMonths(cur, -2), addMonths(cur, -1), cur];
  const registered = (data.subscriptions || []).map((s) => norm(s.name));
  const billNames = (data.bills || []).filter((b) => !b.archived && b.recurrence).map((b) => norm(b.name));
  const groups = new Map();
  for (const t of spendOf(data)) {
    const mk = ymOf(t.date); if (!window.includes(mk)) continue;
    const key = merchantKey(t.description || ""); if (key === "outros" || key.length < 4 || GENERIC_RE.test(norm(t.description))) continue;
    if (!groups.has(key)) groups.set(key, { key, months: new Set(), amounts: [], last: t.date, sample: t.description, categoryId: t.categoryId, accountId: t.accountId });
    const g = groups.get(key); g.months.add(mk); g.amounts.push(t.amount); if (t.date > g.last) { g.last = t.date; g.sample = t.description; g.categoryId = t.categoryId; g.accountId = t.accountId; }
  }
  const out = [];
  for (const g of groups.values()) {
    if (g.months.size < 3) continue;
    const avg = mean(g.amounts); if (avg < 25) continue;
    const sd = Math.sqrt(mean(g.amounts.map((x) => (x - avg) ** 2)));
    if (sd / avg > 0.25) continue;
    const toks = g.key.split(" ");
    if (registered.some((r) => toks.some((w) => w.length > 3 && r.includes(w))) || billNames.some((r) => toks.some((w) => w.length > 3 && r.includes(w)))) continue;
    out.push({ key: g.key, name: g.sample.replace(/\s+/g, " ").slice(0, 40), avg: round2(avg), months: g.months.size, last: g.last, categoryId: g.categoryId, accountId: g.accountId });
  }
  return out.sort((a, b) => b.avg - a.avg).slice(0, 8);
}

export function analyze(data, now = todaySP()) {
  const cur = ymOf(now);
  const dim = daysInMonth(cur);
  const dayN = Number(now.slice(8, 10));
  const series = monthlySeries(data, now, 12);
  const curM = series[series.length - 1];
  const prevM = series[series.length - 2];
  const prev3 = series.slice(-4, -1);
  const avgSpend3 = round2(mean(prev3.map((m) => m.spend)));
  const incomeMonths = series.slice(-4, -1).filter((m) => m.income > 0);
  const avgIncome = round2(mean(incomeMonths.map((m) => m.income)));
  const projected = round2(dayN > 0 ? (curM.spend / dayN) * dim : curM.spend);
  const catName = (id) => (data.categories.find((c) => c.id === id) || {}).name || "Sem categoria";

  // ---- categorias: este mês x mês anterior x média dos 3 anteriores, com minigráfico de 6 meses ----
  const catIds = new Set(series.slice(-6).flatMap((m) => [...m.cats.keys()]));
  const categories = [...catIds].map((id) => {
    const cm = curM.cats.get(id) || 0, pm = prevM.cats.get(id) || 0;
    const avg3 = mean(prev3.map((m) => m.cats.get(id) || 0));
    return { id, name: catName(id), current: round2(cm), previous: round2(pm), avg3: round2(avg3), deltaVsAvg: avg3 > 0 ? (cm - avg3) / avg3 : null, trend: series.slice(-6).map((m) => round2(m.cats.get(id) || 0)), share: curM.spend > 0 ? cm / curM.spend : 0 };
  }).filter((c) => c.current > 0 || c.avg3 > 0).sort((a, b) => b.current - a.current);

  // ---- estabelecimentos, dias da semana, faixas do mês (últimos 90 dias) ----
  const from90 = addDaysISO(now, -90);
  const recent = spendOf(data).filter((t) => t.date >= from90 && t.date <= now);
  const mm = new Map();
  for (const t of recent) { const k = merchantKey(t.description || ""); const g = mm.get(k) || { key: k, name: t.description, total: 0, count: 0 }; g.total += t.amount; g.count++; mm.set(k, g); }
  const merchants = [...mm.values()].map((g) => ({ ...g, total: round2(g.total), name: String(g.name || g.key).replace(/\s+/g, " ").slice(0, 38) })).sort((a, b) => b.total - a.total).slice(0, 10);
  const weekday = Array.from({ length: 7 }, () => 0);
  const monthThirds = [0, 0, 0];
  for (const t of recent) { weekday[new Date(`${t.date}T12:00:00Z`).getUTCDay()] += t.amount; const d = Number(t.date.slice(8, 10)); monthThirds[d <= 10 ? 0 : d <= 20 ? 1 : 2] += t.amount; }
  const biggest = recent.slice().sort((a, b) => b.amount - a.amount).slice(0, 6).map((t) => ({ id: t.id, date: t.date, amount: t.amount, description: t.description, category: catName(t.categoryId) }));

  // ---- taxas, juros e Pix a terceiros (6 meses) ----
  const from180 = addDaysISO(now, -180);
  const r6 = spendOf(data).filter((t) => t.date >= from180 && t.date <= now);
  const fees = r6.filter((t) => FEE_RE.test(norm(t.description)));
  const pixOut = r6.filter((t) => PIX_OUT_RE.test(norm(t.description)));
  const pixBy = new Map();
  for (const t of pixOut) { const k = merchantKey(t.description); pixBy.set(k, (pixBy.get(k) || 0) + t.amount); }

  // ---- caixa: o que há nas contas x o que vence ----
  const liquidAccounts = data.accounts.filter((a) => !a.archived && ["checking", "savings", "cash"].includes(a.type));
  const liquid = round2(sum(liquidAccounts, (a) => Number(a.of?.balance ?? a.balance) || 0));
  const cards = data.accounts.filter((a) => !a.archived && a.type === "credit_card").map((a) => {
    // cartão sem Open Finance (ex.: Caixa): limite digitado à mão e uso = contas em aberto ligadas a ele
    const manualUsed = (data.bills || []).filter((b) => !b.archived && b.accountId === a.id && b.status !== "paid").reduce((s, b) => s + b.amount, 0);
    const limit = Number(a.of?.creditLimit ?? a.creditLimit) || 0, used = a.of ? Math.abs(Number(a.of.balance ?? a.of.usedLimit) || 0) : manualUsed || Math.abs(Number(a.balance) || 0);
    return { id: a.id, name: a.name, limit, used: round2(used), available: Number(a.of?.availableCreditLimit) || Math.max(0, limit - used), usedPct: limit > 0 ? Math.min(1, used / limit) : null, closeDate: a.of?.closeDate || null, dueDate: a.of?.dueDate || null };
  });
  const bills = (data.bills || []).filter((b) => !b.archived && b.status !== "paid" && !b.hideFromForecast).map((b) => (b.dueDate < now ? { ...b, status: "overdue" } : b));
  const overdue = bills.filter((b) => b.status === "overdue");
  const due7 = bills.filter((b) => b.status !== "overdue" && b.dueDate <= addDaysISO(now, 7));
  const due30 = bills.filter((b) => b.status !== "overdue" && b.dueDate <= addDaysISO(now, 30));
  const cash = { liquid, overdue: round2(sum(overdue, (b) => b.amount)), due7: round2(sum(due7, (b) => b.amount)), due30: round2(sum(due30, (b) => b.amount)) };
  cash.afterDue30 = round2(cash.liquid - cash.overdue - cash.due30);

  // ---- compromissos dos próximos meses, por tipo ----
  const recurringIds = new Set((data.subscriptions || []).map((s) => s.seriesId));
  const typeOf = (b) => (b.source === "openfinance" ? "cards" : recurringIds.has(b.seriesId) ? ((data.subscriptions.find((s) => s.seriesId === b.seriesId)?.kind || "subscription") === "fixed" ? "fixed" : "subs") : /d[ií]vida|empr[eé]stimo/i.test(catName(b.categoryId)) || b.installment ? "debts" : "other");
  const future = new Map();
  for (const b of bills) {
    const k = b.dueDate < cur ? cur : ymOf(b.dueDate);
    const m = future.get(k) || { key: k, cards: 0, fixed: 0, subs: 0, debts: 0, other: 0, total: 0 };
    const t = typeOf(b); m[t] += b.amount; m.total += b.amount; future.set(k, m);
  }
  const commitments = [...future.values()].sort((a, b) => a.key.localeCompare(b.key)).slice(0, 6).map((m) => ({ ...m, cards: round2(m.cards), fixed: round2(m.fixed), subs: round2(m.subs), debts: round2(m.debts), other: round2(m.other), total: round2(m.total) }));

  // ---- dívidas (parcelamentos e empréstimos em andamento) ----
  const bySeries = new Map();
  for (const b of (data.bills || []).filter((x) => !x.archived && x.source !== "openfinance")) { if (!b.seriesId) continue; (bySeries.get(b.seriesId) || bySeries.set(b.seriesId, []).get(b.seriesId)).push(b); }
  const debts = [...bySeries.values()].map((items) => {
    const sorted = items.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const open = sorted.filter((b) => b.status !== "paid");
    const endless = sorted[0].recurrence && sorted[0].recurrence.endDate === null;
    return { name: sorted[0].name, category: catName(sorted[0].categoryId), remaining: round2(sum(open, (b) => b.amount)), count: open.length, last: sorted[sorted.length - 1].dueDate, perMonth: open.length ? round2(sum(open, (b) => b.amount) / Math.max(1, new Set(open.map((b) => ymOf(b.dueDate))).size)) : 0, endless, isDebt: !endless && /d[ií]vida|empr[eé]stimo|compras/i.test(catName(sorted[0].categoryId) + " " + sorted[0].name) || Boolean(sorted[0].installment) };
  }).filter((d) => d.isDebt && d.remaining > 0).sort((a, b) => b.remaining - a.remaining);

  const rec = recurringSummary(data);
  const commitPct = avgIncome > 0 ? (rec.total + sum(debts, (d) => d.perMonth)) / avgIncome : null;
  const savingsRate = prevM.income > 0 ? (prevM.income - prevM.spend) / prevM.income : null;

  // ---- leitura em frases ----
  const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const pct = (n) => `${Math.round(Math.abs(n) * 100)}%`;
  const insights = [];
  if (cash.overdue > 0) insights.push({ tone: "bad", title: "Contas atrasadas", text: `${overdue.length} conta(s) vencida(s) somando ${brl(cash.overdue)}. Resolver estas primeiro evita juros e multa.` });
  if (cash.afterDue30 < 0) insights.push({ tone: "bad", title: "Caixa não cobre os próximos 30 dias", text: `Há ${brl(cash.liquid)} nas contas e ${brl(cash.overdue + cash.due30)} a pagar (atrasadas + 30 dias). Faltam ${brl(-cash.afterDue30)}.` });
  else if (cash.liquid > 0) insights.push({ tone: "good", title: "Caixa cobre os próximos 30 dias", text: `Depois de pagar tudo que vence até ${addDaysISO(now, 30).split("-").reverse().slice(0, 2).join("/")} sobram ${brl(cash.afterDue30)}.` });
  if (avgSpend3 > 0 && dayN >= 5) {
    const d = (projected - avgSpend3) / avgSpend3;
    if (d > 0.15) insights.push({ tone: "warn", title: "Ritmo de gasto acima do normal", text: `Gastou ${brl(curM.spend)} em ${dayN} dias; no ritmo atual fecha o mês em ${brl(projected)}, ${pct(d)} acima da média dos 3 meses anteriores (${brl(avgSpend3)}).` });
    else if (d < -0.1) insights.push({ tone: "good", title: "Ritmo de gasto abaixo do normal", text: `No ritmo atual o mês fecha em ${brl(projected)}, ${pct(d)} abaixo da média dos 3 meses anteriores (${brl(avgSpend3)}).` });
  }
  if (savingsRate !== null) insights.push({ tone: savingsRate >= 0.1 ? "good" : savingsRate >= 0 ? "info" : "warn", title: `Mês passado: ${savingsRate >= 0 ? "sobrou" : "faltou"} ${pct(savingsRate)} da renda`, text: `Entrou ${brl(prevM.income)} e saiu ${brl(prevM.spend)} (${brl(prevM.income - prevM.spend)}).` });
  if (commitPct !== null) insights.push({ tone: commitPct > 0.6 ? "bad" : commitPct > 0.4 ? "warn" : "info", title: `${pct(commitPct)} da renda já está comprometida`, text: `Fixas e assinaturas (${brl(rec.total)}) mais parcelas de dívidas por mês, sobre uma renda média de ${brl(avgIncome)}.` });
  const CATCHALL = /pix|outros|pagamentos com cart/i;
  const top = categories.find((c) => !CATCHALL.test(c.name));
  if (top && top.share > 0.3) insights.push({ tone: "info", title: `${top.name} é ${pct(top.share)} do gasto do mês`, text: `${brl(top.current)} até agora${top.avg3 > 0 ? `, contra uma média de ${brl(top.avg3)} nos 3 meses anteriores` : ""}.` });
  const risers = categories.filter((c) => c.deltaVsAvg !== null && c.deltaVsAvg > 0.4 && c.current - c.avg3 > 80).slice(0, 2);
  for (const c of risers) insights.push({ tone: "warn", title: `${c.name} subiu ${pct(c.deltaVsAvg)}`, text: `${brl(c.current)} neste mês contra ${brl(c.avg3)} de média.` });
  const detected = detectRecurring(data, now);
  if (detected.length) insights.push({ tone: "info", title: `${detected.length} gasto(s) que parecem fixos e não estão cadastrados`, text: `${detected.slice(0, 3).map((d) => `${d.name} (${brl(d.avg)})`).join(", ")}. Cadastre em Fixas e assinaturas para entrarem na previsão.` });
  if (fees.length) insights.push({ tone: "warn", title: "Taxas, juros e IOF", text: `${brl(sum(fees, (t) => t.amount))} em ${fees.length} cobrança(s) nos últimos 6 meses.` });
  if (pixOut.length) insights.push({ tone: "info", title: "Pix para terceiros", text: `${brl(sum(pixOut, (t) => t.amount))} em ${pixOut.length} Pix nos últimos 6 meses.` });

  // ---- nota de saúde, o que fazer agora e sinais (o que a Visão geral mostra no topo) ----
  const income = avgIncome || prevM.income || 1;
  const pen = [];
  if (cash.overdue > 0) pen.push([Math.min(30, 10 + 20 * Math.min(1, cash.overdue / income)), "atrasos"]);
  if (cash.afterDue30 < 0) pen.push([Math.min(25, 10 + 15 * Math.min(1, -cash.afterDue30 / income)), "caixa"]);
  if (savingsRate !== null) pen.push([savingsRate < 0 ? 15 : savingsRate < 0.1 ? 7 : 0, "poupança"]);
  if (commitPct !== null) pen.push([commitPct > 0.6 ? 15 : commitPct > 0.4 ? 8 : 0, "comprometimento"]);
  if (avgSpend3 > 0 && dayN >= 5 && projected > avgSpend3 * 1.15) pen.push([8, "ritmo"]);
  const score = Math.max(5, Math.min(100, Math.round(100 - sum(pen, (p) => p[0]))));
  const tone = score >= 80 ? "good" : score >= 60 ? "warn" : "bad";
  const label = score >= 80 ? "Saudável" : score >= 60 ? "Atenção" : score >= 40 ? "Apertado" : "Crítico";
  const oldest = overdue.length ? overdue.map((b) => b.dueDate).sort()[0] : null;
  const ddmm = (iso) => iso.split("-").reverse().slice(0, 2).join("/");
  const headline = cash.overdue > 0 && cash.afterDue30 < 0 ? "Mais contas do que dinheiro nos próximos 30 dias"
    : cash.overdue > 0 ? "Caixa ok, mas há contas atrasadas para quitar"
    : cash.afterDue30 < 0 ? "O caixa não cobre tudo que vence em 30 dias"
    : (savingsRate !== null && savingsRate < 0) ? "Você gastou mais do que ganhou no mês passado"
    : "Suas finanças estão em dia";
  const sub = cash.overdue > 0 || cash.afterDue30 < 0
    ? `${brl(cash.liquid)} nas contas contra ${brl(cash.overdue + cash.due30)} entre atrasadas e próximos 30 dias.`
    : `Depois das contas dos próximos 30 dias ainda sobram ${brl(cash.afterDue30)}.`;
  const actions = [];
  if (overdue.length) actions.push({ key: "overdue", tone: "bad", title: `Quitar ${overdue.length} conta${overdue.length > 1 ? "s" : ""} atrasada${overdue.length > 1 ? "s" : ""}`, text: `${brl(cash.overdue)} no total. A mais antiga venceu em ${ddmm(oldest)}.`, cta: "Ver atrasadas", tab: "bills" });
  if (cash.afterDue30 < 0) actions.push({ key: "cash", tone: "bad", title: `Faltam ${brl(-cash.afterDue30)} para os próximos 30 dias`, text: `Priorize o que tem juros e renegocie o resto. Há ${brl(cash.due7)} vencendo em 7 dias.`, cta: "Ver vencimentos", tab: "bills" });
  const hot = cards.filter((k) => k.usedPct !== null && k.usedPct > 0.8)[0];
  if (hot) actions.push({ key: "card", tone: "warn", title: `${hot.name} está com ${pct(hot.usedPct)} do limite`, text: `${brl(hot.used)} de ${brl(hot.limit)}. Evite novas compras até a fatura fechar.`, cta: "Ver cartões", tab: "accounts" });
  if (detected.length) actions.push({ key: "detected", tone: "info", title: `Cadastrar ${detected.length} gasto${detected.length > 1 ? "s" : ""} que se repete${detected.length > 1 ? "m" : ""}`, text: `${detected.slice(0, 2).map((d) => `${d.name} (${brl(d.avg)})`).join(" e ")}. Entram na previsão dos próximos meses.`, cta: "Cadastrar", tab: "recurring" });
  if (!actions.length) actions.push({ key: "ok", tone: "good", title: "Nada urgente", text: "Sem atrasos e com caixa para os próximos 30 dias.", cta: null, tab: null });
  const signals = [];
  if (savingsRate !== null) signals.push({ key: "save", label: "Poupança do mês passado", value: pct(savingsRate), sub: `${brl(prevM.income - prevM.spend)} de ${brl(prevM.income)}`, tone: savingsRate >= 0.1 ? "good" : savingsRate >= 0 ? "info" : "bad" });
  if (commitPct !== null) signals.push({ key: "commit", label: "Renda comprometida", value: pct(commitPct), sub: `fixas, assinaturas e parcelas`, tone: commitPct > 0.6 ? "bad" : commitPct > 0.4 ? "warn" : "good" });
  if (avgSpend3 > 0 && dayN >= 5) { const d = (projected - avgSpend3) / avgSpend3; signals.push({ key: "pace", label: "Ritmo do mês", value: `${d > 0 ? "+" : "−"}${pct(d)}`, sub: `fecha em ${brl(projected)} (média ${brl(avgSpend3)})`, tone: d > 0.15 ? "warn" : d < -0.1 ? "good" : "info" }); }
  signals.push({ key: "subs", label: "Fixas e assinaturas", value: brl(rec.total), sub: "por mês", tone: "info" });
  signals.push({ key: "fees", label: "Taxas, juros e IOF", value: brl(sum(fees, (t) => t.amount)), sub: `${fees.length} cobrança(s) em 6 meses`, tone: fees.length ? "warn" : "good" });
  signals.push({ key: "pix", label: "Pix para terceiros", value: brl(sum(pixOut, (t) => t.amount)), sub: `${pixOut.length} Pix em 6 meses`, tone: "info" });
  const health = { score, label, tone, headline, sub, factors: pen.map((p) => p[1]) };

  return {
    health, actions, signals,
    now, current: { key: cur, spent: curM.spend, income: curM.income, day: dayN, days: dim, projected, avgSpend3, avgIncome, prev: prevM },
    series, categories, merchants, weekday: weekday.map(round2), monthThirds: monthThirds.map(round2), biggest,
    fees: { total: round2(sum(fees, (t) => t.amount)), count: fees.length }, pix: { total: round2(sum(pixOut, (t) => t.amount)), count: pixOut.length, top: [...pixBy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => ({ name: k, total: round2(v) })) },
    cash, cards, commitments, debts, recurring: rec, detected, commitPct, savingsRate, insights,
  };
}
