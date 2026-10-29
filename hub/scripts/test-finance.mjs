// node scripts/test-finance.mjs — análise (lib/finance/analytics.js) e fixas/assinaturas (lib/finance/recurring.js), sem rede nem disco.
import assert from "node:assert/strict";
import { analyze, detectRecurring, merchantKey, monthlySeries } from "../lib/finance/analytics.js";
import { suggestPayees, applyRules, linkSeries, unlinkSeries } from "../lib/finance/reconcile.js";
import { adoptRecurring, createRecurring, removeRecurring, updateRecurring } from "../lib/finance/recurring.js";

const NOW = "2026-10-21";
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const tx = (id, date, amount, description, extra = {}) => ({ id, accountId: "a1", categoryId: extra.categoryId || "c_out", type: "expense", amount, date, description, archived: false, ...extra });
const base = () => ({
  accounts: [{ id: "a1", name: "Nubank Conta", type: "checking", of: { balance: 3000 } }, { id: "k1", name: "Cartão Nubank", type: "credit_card", of: { balance: 800, creditLimit: 2000, availableCreditLimit: 1200 } }],
  categories: [{ id: "c_mer", name: "Mercado" }, { id: "c_out", name: "Outros" }, { id: "c_fix", name: "Contas fixas" }, { id: "c_sal", name: "Salário" }, { id: "c_ass", name: "Assinaturas" }],
  transactions: [], bills: [], subscriptions: [],
});

t("merchantKey tira o ruído do banco", () => {
  assert.equal(merchantKey("PIX ENVIADO ORLANDO PARDINI GA 123"), "orlando pardini");
  assert.equal(merchantKey("Compra no débito MERCADOLIVRE*MERCADOL OSASCO"), "mercadolivre mercadol");
});

t("série mensal: transferências e arquivados não contam", () => {
  const d = base();
  d.transactions.push(tx("1", "2026-10-02", 100, "Mercado", { categoryId: "c_mer" }), tx("2", "2026-10-03", 900, "Pagamento fatura", { transfer: true }), tx("3", "2026-10-04", 50, "Velho", { archived: true }),
    tx("4", "2026-10-05", 5000, "Salário", { type: "income", categoryId: "c_sal" }), tx("5", "2026-09-10", 200, "Mercado", { categoryId: "c_mer" }));
  const s = monthlySeries(d, NOW, 12);
  assert.equal(s.length, 12);
  assert.equal(s[11].key, "2026-10"); assert.equal(s[11].spend, 100); assert.equal(s[11].income, 5000);
  assert.equal(s[10].spend, 200);
});

t("análise: caixa, projeção, comprometimento e frases", () => {
  const d = base();
  for (const [m, a] of [["07", 400], ["08", 500], ["09", 600]]) { d.transactions.push(tx("e" + m, `2026-${m}-10`, a, "Mercado", { categoryId: "c_mer" }), tx("r" + m, `2026-${m}-05`, 4000, "Salário", { type: "income", categoryId: "c_sal" })); }
  d.transactions.push(tx("cur", "2026-10-10", 1000, "Mercado", { categoryId: "c_mer" }));
  d.bills.push({ id: "b1", name: "Aluguel", categoryId: "c_fix", amount: 1280, dueDate: "2026-09-01", status: "pending", seriesId: "s1", recurrence: { freq: "monthly", dayOfMonth: 1, endDate: null } },
    { id: "b2", name: "Celular", categoryId: "c_fix", amount: 60, dueDate: "2026-10-28", status: "pending", seriesId: "s2", recurrence: { freq: "monthly", dayOfMonth: 28, endDate: null } });
  d.subscriptions.push({ id: "u1", kind: "fixed", name: "Celular", amount: 60, active: true, seriesId: "s2" });
  const A = analyze(d, NOW);
  assert.equal(A.cash.liquid, 3000); assert.equal(A.cash.overdue, 1280); assert.equal(A.cash.due30, 60); assert.equal(A.cash.afterDue30, 3000 - 1280 - 60);
  assert.equal(A.current.spent, 1000); assert.equal(A.current.avgSpend3, 500); assert.equal(A.current.avgIncome, 4000);
  assert.ok(A.current.projected > 1000 && A.current.projected < 1700); // 1000 em 21 dias -> ~1476
  assert.equal(A.categories[0].name, "Mercado");
  assert.ok(A.insights.some((i) => i.tone === "bad" && /atrasadas/i.test(i.title)));
  assert.ok(A.insights.some((i) => /Ritmo de gasto acima/.test(i.title)));
  assert.equal(A.cards[0].usedPct, 0.4);
  assert.equal(A.recurring.fixed, 60);
  assert.ok(A.health.score >= 5 && A.health.score < 100 && ["warn", "bad"].includes(A.health.tone)); // há conta atrasada
  assert.equal(A.actions[0].key, "overdue"); assert.equal(A.actions[0].tab, "bills");
  assert.ok(A.signals.some((s) => s.key === "commit"));
  assert.equal(analyze(base(), NOW).actions[0].key, "ok"); // sem nada pendente: nada urgente
});

t("detecta gasto que se repete e ainda não está cadastrado", () => {
  const d = base();
  for (const m of ["07", "08", "09", "10"]) d.transactions.push(tx("n" + m, `2026-${m}-12`, 39.9 + (m === "08" ? 0.5 : 0), "NETFLIX.COM 4012"));
  d.transactions.push(tx("x1", "2026-10-02", 17, "Padaria"), tx("x2", "2026-09-02", 90, "Padaria"));
  let got = detectRecurring(d, NOW);
  assert.equal(got.length, 1); assert.match(got[0].name, /NETFLIX/); assert.equal(got[0].months, 4);
  d.subscriptions.push({ id: "u", name: "Netflix", kind: "subscription", amount: 40, active: true, seriesId: "sx" });
  assert.equal(detectRecurring(d, NOW).length, 0); // já cadastrada
});

t("fixa nova: gera as próximas 3 contas a partir de hoje, sem a de dia que já passou", () => {
  const d = base();
  const s = createRecurring(d, { kind: "fixed", name: "Academia", amount: 99.9, dayOfMonth: 5, categoryId: "c_fix" }, NOW);
  const due = d.bills.filter((b) => b.seriesId === s.seriesId).map((b) => b.dueDate).sort();
  assert.deepEqual(due, ["2026-11-05", "2026-12-05", "2027-01-05"]); // 05/10 já passou
  const s2 = createRecurring(d, { kind: "subscription", name: "Spotify", amount: 42, dayOfMonth: 25 }, NOW);
  assert.deepEqual(d.bills.filter((b) => b.seriesId === s2.seriesId).map((b) => b.dueDate).sort(), ["2026-10-25", "2026-11-25", "2026-12-25"]);
});

t("mudar valor/dia/conta atualiza só as contas futuras não pagas", () => {
  const d = base();
  const s = createRecurring(d, { kind: "fixed", name: "Aluguel", amount: 1280, dayOfMonth: 1, accountId: "a1" }, "2026-09-02");
  const bills = d.bills.filter((b) => b.seriesId === s.seriesId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  bills[0].status = "paid"; // outubro pago
  updateRecurring(d, s.id, { amount: 1400, dayOfMonth: 10 }, NOW);
  const after = d.bills.filter((b) => b.seriesId === s.seriesId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  assert.equal(after[0].amount, 1280); assert.equal(after[0].dueDate, "2026-10-01"); // pago e passado: intacto
  const fut = after.filter((b) => b.dueDate >= NOW);
  assert.ok(fut.length >= 3 && fut.every((b) => b.amount === 1400 && b.dueDate.endsWith("-10")), JSON.stringify(fut.map((b) => [b.dueDate, b.amount])));
  assert.equal(new Set(after.map((b) => b.dueDate.slice(0, 7))).size, after.length); // um por mês
});

t("desligar tira as futuras (mantém passado e pago); ligar de novo traz de volta; excluir limpa", () => {
  const d = base();
  const s = createRecurring(d, { kind: "subscription", name: "Canva", amount: 35, dayOfMonth: 25 }, "2026-09-02");
  updateRecurring(d, s.id, { active: false }, NOW);
  const left = d.bills.filter((b) => b.seriesId === s.seriesId);
  assert.ok(left.every((b) => b.dueDate <= NOW), JSON.stringify(left.map((b) => b.dueDate)));
  assert.equal(d.subscriptions[0].cancelledAt, NOW);
  updateRecurring(d, s.id, { active: true }, NOW);
  assert.ok(d.bills.filter((b) => b.seriesId === s.seriesId && b.dueDate >= NOW).length >= 3);
  removeRecurring(d, s.id, NOW);
  assert.equal(d.subscriptions.length, 0);
  assert.ok(d.bills.filter((b) => b.seriesId === s.seriesId).every((b) => b.dueDate < NOW));
});

t("adotar séries mensais antigas no cadastro (fixa ou assinatura)", () => {
  const d = base();
  const mk = (id, name, cat, series, status = "pending") => ({ id, name, categoryId: cat, amount: 50, dueDate: "2026-11-01", status, seriesId: series, recurrence: { freq: "monthly", dayOfMonth: 1, endDate: null }, source: "chat" });
  d.bills.push(mk("b1", "Barbeiro", "c_fix", "s1"), mk("b2", "Spotify", "c_ass", "s2"), mk("b3", "Parcela", "c_out", "s3"), { ...mk("b4", "Fatura", "c_fix", "s4"), source: "openfinance" });
  d.bills[2].recurrence = null;
  assert.equal(adoptRecurring(d, NOW), 2);
  assert.deepEqual(d.subscriptions.map((s) => [s.name, s.kind]).sort(), [["Barbeiro", "fixed"], ["Spotify", "subscription"]]);
  assert.equal(adoptRecurring(d, NOW), 0); // idempotente
});

t("conciliação por favorecido: sugere, vincula e baixa com data e valor reais do banco", () => {
  const d = base();
  const mk = (id, due, status = "pending") => ({ id, name: "Aluguel", categoryId: "c_fix", amount: 1280, dueDate: due, status, seriesId: "sAlu", recurrence: { freq: "monthly", dayOfMonth: 1, endDate: null }, source: "chat" });
  d.bills.push(mk("a1", "2026-08-01", "paid"), mk("a2", "2026-09-01"), mk("a3", "2026-10-01"), mk("a4", "2026-11-01"));
  const of = (id, date, amount, description) => tx(id, date, amount, description, { source: "openfinance" });
  d.transactions.push(of("p1", "2026-08-06", 1262.75, "Pix enviado para PEDRO HENRIQUE DA SILVA"), of("p2", "2026-09-04", 1280, "Pix enviado para PEDRO HENRIQUE DA SILVA"), of("p3", "2026-10-02", 1300, "Pix enviado para PEDRO HENRIQUE DA SILVA"), of("x", "2026-10-03", 30, "Pix padaria"));
  const sug = suggestPayees(d, NOW);
  assert.equal(sug.length, 1); assert.equal(sug[0].keyword, "pedro henrique"); assert.ok(sug[0].hits >= 3);
  linkSeries(d, "sAlu", "pedro henrique");
  const r = applyRules(d, NOW);
  assert.equal(r.paid, 2); assert.equal(r.dated, 1); // set e out baixados; ago já estava pago e ganhou a data do banco
  const by = (id) => d.bills.find((b) => b.id === id);
  assert.equal(by("a1").paidAt, "2026-08-06"); assert.equal(by("a1").paidAmount, 1262.75);
  assert.equal(by("a2").status, "paid"); assert.equal(by("a2").paidAt, "2026-09-04");
  assert.equal(by("a3").paidAt, "2026-10-02"); assert.equal(by("a3").paidAmount, 1300);
  assert.equal(by("a4").status, "pending"); // futura: espera
  assert.equal(suggestPayees(d, NOW).length, 0);
  assert.equal(applyRules(d, NOW).paid, 0); // idempotente
  unlinkSeries(d, "sAlu");
  assert.equal(by("a2").paidBy, undefined);
});

console.log(`\n${n} testes passaram`);
