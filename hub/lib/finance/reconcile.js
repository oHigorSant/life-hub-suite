// Conciliação: liga cada conta a pagar (fixa, parcela, dívida) ao pagamento REAL que aparece no banco (Open Finance).
// Vínculo por série: "Aluguel -> pedro henrique". Com o vínculo, todo mês a conta é baixada com a data e o valor que realmente saíram.
import { norm, merchantKey, addDaysISO } from "./analytics.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const GENERIC_KEYS = new Set(["pix", "outros", "transf", "transf enviada", "transferencia", "pagto", "bankslip", "parcela"]);
const TOL = 0.25; // o valor pago pode diferir até 25% do cadastrado (multa, juros, arredondamento)

export function rulesOf(data) {
  const rules = new Map();
  for (const s of data.subscriptions || []) if (s.payee) rules.set(s.seriesId, { keyword: s.payee, via: "subscription" });
  for (const [seriesId, keyword] of Object.entries(data.meta?.payeeRules || {})) if (keyword) rules.set(seriesId, { keyword, via: "meta" });
  return rules;
}

const outflows = (data) => data.transactions.filter((t) => !t.archived && t.type === "expense" && !t.transfer && t.source === "openfinance");
const seriesBills = (data) => {
  const m = new Map();
  for (const b of data.bills || []) { if (b.archived || b.source === "openfinance") continue; const k = b.seriesId || b.id; (m.get(k) || m.set(k, []).get(k)).push(b); }
  return m;
};
const usedTxIds = (data) => new Set((data.bills || []).filter((b) => b.paidBy?.txnId).map((b) => b.paidBy.txnId));
const kws = (keyword) => String(keyword).split("|").map((k) => norm(k)).filter(Boolean);
const hit = (t, words) => { const n = norm(t.description); return words.some((w) => n.includes(w)); };

/** Para cada série ainda sem vínculo: quem recebeu valores parecidos, perto dos vencimentos? */
export function suggestPayees(data, now) {
  const rules = rulesOf(data), ignored = new Set(data.meta?.payeeIgnored || []);
  const outs = outflows(data);
  const sugg = [];
  for (const [seriesId, bills] of seriesBills(data)) {
    if (rules.has(seriesId) || ignored.has(seriesId)) continue;
    if (!bills.some((b) => b.status !== "paid" || !b.paidBy)) continue; // tudo já conciliado
    const nameWords = norm(bills[0].name).split(" ").filter((w) => w.length > 3);
    const tally = new Map();
    for (const b of bills.filter((x) => x.dueDate <= addDaysISO(now, 20))) {
      for (const t of outs) {
        const dd = (Date.parse(t.date) - Date.parse(b.dueDate)) / 864e5;
        if (dd < -7 || dd > 35 || Math.abs(t.amount - b.amount) > b.amount * 0.15 + 0.5) continue; // para SUGERIR, mais apertado do que para baixar
        const key = merchantKey(t.description);
        if (!key || key.length < 4 || GENERIC_KEYS.has(key)) continue;
        const e = tally.get(key) || { key, bills: new Set(), examples: [], sample: t.description };
        if (!e.bills.has(b.id)) { e.bills.add(b.id); e.examples.push({ due: b.dueDate, billAmount: b.amount, date: t.date, amount: t.amount, description: t.description.slice(0, 44) }); }
        tally.set(key, e);
      }
    }
    const ranked = [...tally.values()].map((e) => ({ ...e, nameHit: nameWords.some((w) => e.key.includes(w) || norm(e.sample).includes(w)), })).map((e) => ({ ...e, score: e.bills.size + (e.nameHit ? 1.5 : 0) })).sort((a, b) => b.score - a.score);
    for (const best of ranked.slice(0, 3)) sugg.push({ seriesId, name: bills[0].name, keyword: best.key, label: best.sample.replace(/\s+/g, " ").slice(0, 44), hits: best.bills.size, of: bills.length, examples: best.examples.sort((a, b) => b.due.localeCompare(a.due)).slice(0, 3), score: best.score, nameHit: best.nameHit });
  }
  // um favorecido que "serve" para muitas contas diferentes é coincidência de valor, não vínculo: só fica quem tem o nome da conta ou é o único dono
  const uses = new Map();
  for (const s of sugg) uses.set(s.keyword, (uses.get(s.keyword) || new Set()).add(s.seriesId));
  const ownedByName = new Map(); // favorecido que leva o nome de uma conta (Orlando) pertence a ela, não às outras
  for (const s of sugg) if (s.nameHit) ownedByName.set(s.keyword, s.seriesId);
  const bestBySeries = new Map();
  for (const s of sugg.filter((x) => (x.nameHit || uses.get(x.keyword).size <= 2) && (x.nameHit || !ownedByName.has(x.keyword) || ownedByName.get(x.keyword) === x.seriesId)).sort((a, b) => b.score - a.score)) if (!bestBySeries.has(s.seriesId) && (s.nameHit || s.hits >= 2)) bestBySeries.set(s.seriesId, s);
  return [...bestBySeries.values()].sort((a, b) => b.score - a.score);
}

/** Aplica os vínculos: baixa as contas da série com a data e o valor reais do banco. Não mexe em conta já conciliada. */
export function applyRules(data, now) {
  const rules = rulesOf(data);
  const used = usedTxIds(data);
  const outs = outflows(data).sort((a, b) => a.date.localeCompare(b.date));
  let paid = 0, dated = 0;
  for (const [seriesId, bills] of seriesBills(data)) {
    const rule = rules.get(seriesId); if (!rule) continue;
    const words = kws(rule.keyword); if (!words.length) continue;
    for (const b of bills.filter((x) => !x.paidBy).sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      if (b.dueDate > addDaysISO(now, 12)) continue; // futura demais para já ter sido paga
      const cands = outs.filter((t) => !used.has(t.id) && hit(t, words) && Math.abs(t.amount - b.amount) <= b.amount * TOL + 0.5 && (Date.parse(t.date) - Date.parse(b.dueDate)) / 864e5 >= -12 && (Date.parse(t.date) - Date.parse(b.dueDate)) / 864e5 <= 45)
        .sort((x, y) => Math.abs(x.amount - b.amount) / b.amount * 10 + Math.abs(Date.parse(x.date) - Date.parse(b.dueDate)) / 864e5 / 30 - (Math.abs(y.amount - b.amount) / b.amount * 10 + Math.abs(Date.parse(y.date) - Date.parse(b.dueDate)) / 864e5 / 30));
      const t = cands[0]; if (!t) continue;
      used.add(t.id);
      if (b.status !== "paid") paid++; else dated++;
      b.status = "paid"; b.paidAt = t.date; b.paidAmount = round2(t.amount);
      b.paidBy = { txnId: t.id, via: "openfinance", auto: true, rule: rule.keyword };
      b.updatedAt = new Date().toISOString();
    }
  }
  return { paid, dated };
}

export function linkSeries(data, seriesId, keyword) {
  if (!seriesId || !String(keyword || "").trim()) throw new Error("Série e nome do recebedor são obrigatórios.");
  data.meta = data.meta || {};
  data.meta.payeeRules = { ...(data.meta.payeeRules || {}), [seriesId]: String(keyword).trim() };
  data.meta.payeeIgnored = (data.meta.payeeIgnored || []).filter((s) => s !== seriesId);
  const sub = (data.subscriptions || []).find((s) => s.seriesId === seriesId); if (sub) sub.payee = String(keyword).trim();
}
export function unlinkSeries(data, seriesId) {
  if (data.meta?.payeeRules) delete data.meta.payeeRules[seriesId];
  const sub = (data.subscriptions || []).find((s) => s.seriesId === seriesId); if (sub) delete sub.payee;
  for (const b of data.bills || []) if (b.seriesId === seriesId && b.paidBy?.auto && b.paidBy.rule) { delete b.paidBy; delete b.paidAmount; }
}
export function ignoreSeries(data, seriesId) {
  data.meta = data.meta || {};
  data.meta.payeeIgnored = [...new Set([...(data.meta.payeeIgnored || []), seriesId])];
}
