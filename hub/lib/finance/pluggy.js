import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readFinance, writeFinance } from "../financeStore.js";
import { emit } from "../live/bus.js";
import { applyRules } from "./reconcile.js";

// Open Finance via Pluggy: o usuário autoriza no banco (widget do Pluggy), o hub guarda só os ids dos "items" e puxa
// contas, transações e faturas por esta API. Credenciais (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET) ficam só no servidor.
const API = (process.env.PLUGGY_API_URL || "https://api.pluggy.ai").replace(/\/$/, "");
const FILE = path.join(process.cwd(), "data", "pluggy.json");
const g = globalThis;
const mem = (g.__lhPluggy ??= { key: null, keyAt: 0, syncing: new Map(), timers: new Map(), scheduler: false });

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dateBR = (iso) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : null);
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const round2 = (n) => Math.round(Number(n) * 100) / 100;

// ---------------------------------------------------------------- estado local (data/pluggy.json)
const DEFAULT = () => ({ items: [], settings: { importBills: true, autoSync: true }, webhookSecret: null, lastSync: null, reconcile: null });
let queue = Promise.resolve();
export function readState() {
  let j = {};
  try { j = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* vazio */ }
  const d = DEFAULT();
  return { ...d, ...j, settings: { ...d.settings, ...(j.settings || {}) }, items: Array.isArray(j.items) ? j.items : [] };
}
function mutateState(fn) {
  const run = queue.then(() => {
    const st = readState();
    const out = fn(st) ?? st;
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(out, null, 2), { mode: 0o600 });
    fs.renameSync(`${FILE}.tmp`, FILE);
    emit("finance");
    return out;
  });
  queue = run.catch(() => {});
  return run;
}

export const credentials = () => ({ id: (process.env.PLUGGY_CLIENT_ID || "").trim(), secret: (process.env.PLUGGY_CLIENT_SECRET || "").trim() });
export const configured = () => { const c = credentials(); return !!(c.id && c.secret); };

export async function webhookSecret() {
  const st = readState();
  if (st.webhookSecret) return st.webhookSecret;
  const s = crypto.randomBytes(24).toString("hex");
  await mutateState((x) => { x.webhookSecret ??= s; });
  return readState().webhookSecret;
}

// ---------------------------------------------------------------- chamadas à API
async function auth(force = false) {
  if (!force && mem.key && Date.now() - mem.keyAt < 100 * 60_000) return mem.key; // a chave vale 2 h
  const c = credentials();
  if (!c.id || !c.secret) throw err("Pluggy não configurado (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET).", 503);
  const r = await fetch(`${API}/auth`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clientId: c.id, clientSecret: c.secret }), signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.apiKey) throw err(r.status === 401 || r.status === 403 ? "Credenciais do Pluggy recusadas (Client ID/Secret)." : `Pluggy /auth respondeu ${r.status}.`, 502);
  mem.key = j.apiKey; mem.keyAt = Date.now();
  return mem.key;
}

export async function pl(p, { method = "GET", body, query } = {}) {
  const url = new URL(API + p);
  for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = await auth(attempt > 0);
    const r = await fetch(url, { method, headers: { "X-API-KEY": key, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
    if ((r.status === 401 || r.status === 403) && attempt === 0) continue;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw err(`Pluggy ${method} ${p}: ${j.message || j.error || r.status}`, r.status === 404 ? 404 : 502);
    return j;
  }
  throw err("Pluggy recusou a autenticação.", 502);
}

async function paged(p, query) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const j = await pl(p, { query: { ...query, page, pageSize: 500 } });
    out.push(...(j.results || []));
    if (!j.totalPages || page >= j.totalPages) break;
  }
  return out;
}

/**
 * Transações pela API v2 (a v1 foi descontinuada). Filtros: accountId, dateFrom, dateTo; resposta { results, next }.
 * `next` vem nulo na última página; quando existe pode ser uma URL (com o cursor em `after`) ou o próprio cursor.
 */
async function txPaged(accountId, from, to = today()) {
  const out = [];
  const seen = new Set();
  let q = { accountId, dateFrom: from, dateTo: to };
  for (let i = 0; i < 60; i++) {
    const j = await pl("/v2/transactions", { query: q });
    out.push(...(j.results || []));
    const next = j.next;
    if (!next) break;
    let nq;
    if (typeof next === "string" && /^https?:/i.test(next)) nq = Object.fromEntries(new URL(next).searchParams.entries());
    else if (typeof next === "string") nq = { ...q, after: next };
    else break;
    const key = JSON.stringify(nq);
    if (seen.has(key)) break; // proteção contra cursor repetido
    seen.add(key); q = nq;
  }
  return out;
}

/** Token curto (30 min) para o widget do navegador; com itemId, reconecta/atualiza um banco existente. */
export async function createConnectToken({ itemId, publicBase } = {}) {
  const options = { clientUserId: "lifehub", avoidDuplicates: true };
  if (publicBase) options.webhookUrl = `${publicBase.replace(/\/$/, "")}/api/finance/pluggy/webhook?token=${await webhookSecret()}`;
  const j = await pl("/connect_token", { method: "POST", body: { options, ...(itemId ? { itemId } : {}) } });
  return { accessToken: j.accessToken };
}

// ---------------------------------------------------------------- mapeamento (funções puras, testadas)
const COLOR_BY_BANK = [[/nubank|nu pagamentos/, "purple"], [/btg/, "blue"], [/c6/, "black"], [/caixa/, "blue"], [/picpay/, "green"], [/inter\b/, "orange"], [/itau/, "orange"], [/bradesco/, "red"], [/santander/, "red"], [/banco do brasil|\bbb\b/, "yellow"]];
export const bankColor = (name) => (COLOR_BY_BANK.find(([re]) => re.test(norm(name))) || [0, "grey"])[1];
const BANK_TOKENS = ["nubank", "c6", "caixa", "picpay", "inter", "itau", "bradesco", "santander", "banco do brasil", "mercado pago", "xp", "btg", "neon", "next", "bv", "sicredi", "sicoob"];
// os bancos mandam o nome jurídico ("PIC PAY MASTERCARD", "NU PAGAMENTOS S.A.", "BANCO C6 S.A."): normaliza antes de reconhecer
const ALIASES = [[/\bpic pay\b/g, "picpay"], [/\bnu (pagamentos|financeira|invest\w*)\b/g, "nubank"], [/\bbanco c6\b/g, "c6"], [/\bcaixa economica( federal)?\b/g, "caixa"], [/\b(banco )?btg pactual\b/g, "btg"], [/\bbanco inter\b/g, "inter"], [/\bitau unibanco\b/g, "itau"]];
const aliased = (s) => ALIASES.reduce((t, [re, to]) => t.replace(re, to), norm(s));
export const bankToken = (name) => { const t = aliased(name); return BANK_TOKENS.find((tok) => new RegExp(`(^|\\s)${tok}(\\s|$)`).test(t)) || null; };
const PRETTY = { nubank: "Nubank", c6: "C6 Bank", picpay: "PicPay", btg: "BTG Pactual", caixa: "Caixa", inter: "Inter", itau: "Itaú", bradesco: "Bradesco", santander: "Santander", "banco do brasil": "Banco do Brasil", "mercado pago": "Mercado Pago", xp: "XP", neon: "Neon", next: "Next", bv: "BV", sicredi: "Sicredi", sicoob: "Sicoob" };

export const hubAccountType = (a) => (a.type === "CREDIT" || a.subtype === "CREDIT_CARD" ? "credit_card" : /SAVINGS/.test(a.subtype || "") ? "savings" : "checking");

/**
 * Nome do banco da conta. Pelo MeuPluggy todos os bancos chegam sob o mesmo conector ("MeuPluggy"): o banco de verdade
 * vem no nome da conta (ex.: "Nubank - Cartão de Crédito"). Para os conectores diretos, vale o nome do conector.
 */
export function institutionName(connector, a, hint = null) {
  const cn = String(connector?.name || "");
  if (!/meu ?pluggy/i.test(cn)) return cn.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim() || cn;
  const text = `${a?.marketingName || ""} ${a?.name || ""}`;
  // cada item do MeuPluggy é UM banco: se esta conta não diz o banco (ex.: cartão "platinum"), vale o das outras contas do item
  const tok = bankToken(text) || hint;
  if (tok) return PRETTY[tok] || tok.replace(/\b\w/g, (c) => c.toUpperCase());
  return String(a?.marketingName || a?.name || cn).replace(/\b(cart[aã]o|conta|cr[eé]dito|corrente|d[eé]bito|poupan[cç]a)\b/gi, "").replace(/[-–|]+/g, " ").replace(/\s+/g, " ").trim() || cn;
}

export function accountName(connectorName, a) {
  const bank = String(connectorName || "Banco").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s*open (finance|banking)\s*/i, " ").replace(/\s+/g, " ").trim();
  const kind = hubAccountType(a) === "credit_card" ? "Cartão" : hubAccountType(a) === "savings" ? "Poupança" : "Conta";
  return `${bank} ${kind}`;
}

const TRANSFER_RE = /pagamento (de )?fatura|pgto\.? fatura|pagto\.? fatura|pagamento recebido|pagamento on.?line|fatura (do )?cart|payment received/i;
// Categorias do Pluggy que NÃO são gasto nem renda: movimentação entre as contas do próprio usuário, pagamento de fatura e aplicações.
// "Transfer - PIX" e "Transfers" são Pix/TED para terceiros: contam como gasto (ou renda).
const TRANSFER_CATS = /^(same person transfer|credit card payment|transfer - internal|investments)$/i;
const TRANSFER_OPS = /^PAGAMENTO_FATURA$/;
const LOAN_RE = /sociedade de credito|financiamento|emprestimo|credito pessoal|consignado|99pay/;

/**
 * Reconhece movimentação do próprio usuário que o Pluggy só rotula como "Transfers": o favorecido tem o NOME do titular
 * (que vem em account.owner; o texto do banco costuma truncar: "Picpay*Maria Silva A") ou é um dos bancos conectados
 * ("PIX ENVIADO C6 BANK COM CARTAO").
 */
export function ownerMatcher(owners, bankTokens = []) {
  const names = [...owners].map((o) => norm(o).split(" ").filter(Boolean)).filter((t) => t.length >= 2 && t[0].length >= 3).map((t) => new RegExp(`\\b${t[0]}\\s+${t[1].slice(0, 4)}`));
  const banks = bankTokens.length ? new RegExp(`pix (enviado|recebido)( para| de)? (${bankTokens.map((b) => b.replace(/[^a-z0-9 ]/g, "")).join("|")})\\b`) : null;
  return (text) => { const n = aliased(text); return names.some((r) => r.test(n)) || !!(banks && banks.test(n)); };
}

/** Transação do Pluggy -> transação do hub (ou null para ignorar). */
export function mapTransaction(tx, account, { now = today(), own = null } = {}) {
  const raw = Number(tx.amount);
  if (!Number.isFinite(raw) || raw === 0) return null;
  const isCard = hubAccountType(account) === "credit_card";
  // cartão: positivo = compra (saída), negativo = pagamento/estorno (entrada). Conta: usa o tipo DEBIT/CREDIT.
  const type = isCard ? (raw > 0 ? "expense" : "income") : tx.type === "DEBIT" || (!tx.type && raw < 0) ? "expense" : "income";
  const date = dateBR(tx.date);
  if (!date || date > now) return null; // parcelas futuras não são lançamentos de hoje
  const description = String(tx.merchant?.name || tx.description || tx.descriptionRaw || "Sem descrição").replace(/\s+/g, " ").trim().slice(0, 200);
  const text = `${tx.description || ""} ${tx.descriptionRaw || ""}`;
  let transfer = TRANSFER_CATS.test(String(tx.category || "").trim()) || TRANSFER_OPS.test(tx.operationType || "") || TRANSFER_RE.test(text);
  // Pix para financeira/empréstimo às vezes vem como "Investments": é parcela de dívida, ou seja, gasto
  if (transfer && /^investments$/i.test(String(tx.category || "").trim()) && LOAN_RE.test(aliased(text))) transfer = false;
  // "Transfers"/"Transfer - PIX" para o próprio titular ou para um banco dele não é gasto
  if (!transfer && own && /^transfer/i.test(String(tx.category || "").trim()) && own(text)) transfer = true;
  const meta = tx.creditCardMetadata || {};
  return {
    pluggyId: tx.id, type, amount: round2(Math.abs(raw)), date, description, transfer,
    pending: tx.status === "PENDING", category: tx.category || null,
    installment: meta.totalInstallments > 1 ? { number: meta.installmentNumber || 1, total: meta.totalInstallments } : null,
  };
}

/** Fatura do Pluggy -> conta a pagar do hub. */
export function mapBill(bill, hubAccount, categoryId, { now = today() } = {}) {
  const due = dateBR(bill.dueDate);
  const total = round2(bill.totalAmount);
  const paid = round2((bill.payments || []).reduce((s, p) => s + Math.abs(Number(p.amount) || 0), 0));
  const status = total > 0 && paid >= total - 0.01 ? "paid" : due && due < now ? "overdue" : "pending";
  return { pluggyBillId: bill.id, name: `Fatura ${hubAccount.name.replace(/^Cart[aã]o\s+/i, "")}`, amount: total, paid, dueDate: due, status, categoryId, accountId: hubAccount.id };
}

const rid = (p) => p + "_" + Math.random().toString(36).slice(2, 10);
const addDaysStr = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const addMonthStr = (ymd, n = 1) => {
  const [y, m, d] = ymd.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastDay)));
  return t.toISOString().slice(0, 10);
};

/**
 * Faturas do cartão -> contas a pagar: as faturas fechadas (últimos ~75 dias + qualquer não paga) e a fatura EM ABERTO,
 * projetada a partir da dívida atual do cartão (saldo) para o próximo vencimento. Reimportar atualiza, nunca duplica.
 */
export function applyCardBills(data, hub, a, bills, { now = today(), categoryId = null } = {}) {
  const out = { added: 0, updated: 0 };
  const stamp = () => new Date().toISOString();
  const closed = bills.map((b) => mapBill(b, hub, categoryId, { now })).filter((m) => m.dueDate && m.amount > 0).sort((x, y) => y.dueDate.localeCompare(x.dueDate));
  const keepFrom = addDaysStr(now, -75);
  const upsert = (m, notes) => {
    const cur = data.bills.find((x) => x.pluggyBillId === m.pluggyBillId);
    if (cur) {
      // o que o usuário já marcou como pago não volta a ficar pendente
      if (cur.status !== "paid" || m.status === "paid") {
        if (cur.amount !== m.amount || cur.dueDate !== m.dueDate || cur.status !== m.status) { Object.assign(cur, { amount: m.amount, dueDate: m.dueDate, status: m.status, updatedAt: stamp() }); out.updated++; }
      }
      return;
    }
    data.bills.push({ id: rid("bill"), name: m.name, categoryId: m.categoryId, amount: m.amount, originalAmount: null, lateFee: null, dueDate: m.dueDate, status: m.status, recurrence: null, seriesId: "bser_of_" + a.id.slice(0, 8), installment: null, notes, source: "openfinance", pluggyBillId: m.pluggyBillId, accountId: hub.id, archived: false, createdAt: stamp(), updatedAt: stamp() });
    out.added++;
  };
  for (const m of closed) if (m.dueDate >= keepFrom || m.status !== "paid") upsert(m, "Fatura importada do Open Finance (Pluggy).");

  // fatura em aberto = dívida atual do cartão (menos o que ainda falta pagar da última fatura fechada)
  const last = closed[0];
  const remainingLast = last && last.status !== "paid" ? Math.max(0, last.amount - last.paid) : 0;
  const openAmount = round2(Math.max(0, (Number(a.balance) || 0) - remainingLast));
  const nextDue = last ? addMonthStr(last.dueDate, 1) : dateBR(a.creditData?.balanceDueDate);
  const prefix = `open:${a.id}:`;
  let synId = null;
  if (openAmount > 1 && nextDue) {
    synId = `${prefix}${nextDue.slice(0, 7)}`;
    upsert({ pluggyBillId: synId, name: `${closed[0]?.name || `Fatura ${hub.name.replace(/^Cart[aã]o\s+/i, "")}`} (aberta)`, amount: openAmount, dueDate: nextDue, status: nextDue < now ? "overdue" : "pending", categoryId }, "Fatura em aberto: valor atual do cartão, ainda não fechada (muda a cada compra).");
  }
  // projeções antigas (de meses já fechados ou sem valor) saem
  const before = data.bills.length;
  data.bills = data.bills.filter((b) => !(typeof b.pluggyBillId === "string" && b.pluggyBillId.startsWith(prefix) && b.pluggyBillId !== synId));
  out.removed = before - data.bills.length;
  return out;
}

const STOP = new Set(["parcela", "parcelas", "divida", "pagamento", "pagto", "fatura", "conta", "cartao", "emprestimo", "mensal", "pessoal"]);
const nameTokens = (s) => norm(s).split(" ").filter((w) => w.length > 3 && !STOP.has(w));

/**
 * Concilia contas a pagar cadastradas à mão com as saídas REAIS do banco. Marca como paga só quando é inequívoco
 * (valor praticamente igual E o nome da conta aparece na descrição, no prazo certo, uma saída para uma conta).
 * O resto vira sugestão para o usuário confirmar.
 */
export function reconcileBills(data, { now = today() } = {}) {
  const used = new Set(data.bills.filter((b) => b.paidBy?.txnId).map((b) => b.paidBy.txnId));
  const outflows = data.transactions.filter((t) => !t.archived && t.type === "expense" && !t.transfer && !used.has(t.id));
  const open = data.bills.filter((b) => !b.archived && b.source !== "openfinance" && b.status !== "paid" && b.dueDate <= addDaysStr(now, 45));
  const cands = [];
  for (const b of open) {
    const toks = nameTokens(b.name);
    for (const t of outflows) {
      const dd = (Date.parse(t.date) - Date.parse(b.dueDate)) / 864e5;
      if (dd < -10 || dd > 60) continue;
      const diff = Math.abs(t.amount - b.amount);
      const nameHit = toks.some((w) => norm(t.description).includes(w));
      let conf = 0;
      if (nameHit && diff <= 0.5) conf = 3;                                        // nome bate e valor igual: seguro
      else if (nameHit && diff <= b.amount * 0.03 + 0.01) conf = 2;               // nome bate, valor muito próximo
      else if (diff <= 0.01 && Math.abs(dd) <= 2) conf = 1;                        // só o valor exato na data
      else if (diff <= b.amount * 0.03 + 0.01 && dd >= -5 && dd <= 30) conf = 0.5; // só valor aproximado
      if (conf) cands.push({ b, t, conf, ad: Math.abs(dd) });
    }
  }
  cands.sort((x, y) => y.conf - x.conf || x.ad - y.ad);
  const usedTx = new Set(), doneBill = new Set(), auto = [], suggestions = [];
  for (const c of cands) {
    if (usedTx.has(c.t.id) || doneBill.has(c.b.id)) continue;
    usedTx.add(c.t.id); doneBill.add(c.b.id);
    if (c.conf >= 3) {
      c.b.status = "paid"; c.b.paidAt = c.t.date; c.b.paidBy = { txnId: c.t.id, via: "openfinance", auto: true }; c.b.updatedAt = new Date().toISOString();
      auto.push(c);
    } else suggestions.push(c);
  }
  return { auto, suggestions };
}

// ---------------------------------------------------------------- sincronização
const keyOf = (d) => norm(d).split(" ").slice(0, 3).join(" ");

// categoria do Pluggy (inglês, já normalizada) -> categoria do hub (regex sobre o nome normalizado)
const PLUGGY_MAP = [
  [/groceries|supermarket/, /mercado/],
  [/eating out|food delivery|food and drinks|accomodation|accommodation|leisure|entertainment|travel|bars?\b|gaming/, /lazer/],
  [/transportation|taxi|ride|fuel|parking|toll|vehicle|car /, /transporte/],
  [/telecommunication|insurance|^services$|utilities|energy|water|internet|tax on financial|bank fees/, /contas/],
  [/housing|rent|mortgage|condominium/, /moradia/],
  [/video streaming|music streaming|digital services|subscription/, /assinaturas/],
  [/university|school|online courses|education|books/, /educacao/],
  [/healthcare|wellness|pharmacy|health|dentist/, /saude/],
  [/clothing|personal care|beauty/, /pessoal/],
  [/shopping|online shopping|electronics|sports goods|office supplies|home/, /compras online/],
  [/loans|financing|interests charged|late payment|overdraft|credit card fees/, /divida/],
  [/^transfer|pix|bank slip/, /pix/],
];

function categoryPicker(data) {
  const hist = new Map();
  for (const t of data.transactions) {
    if (t.archived || !t.categoryId) continue;
    const k = `${t.type}|${keyOf(t.description)}`;
    const m = hist.get(k) || new Map();
    m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
    hist.set(k, m);
  }
  const byName = (re) => data.categories.find((c) => re.test(norm(c.name)));
  const KEYWORDS = [
    [/mercado|supermerc|atacad|hortifruti|padaria|acougue/, /mercado/], [/uber|99 ?pop|99app|posto|combust|estaciona|pedagio|sem parar|metro|onibus|bilhete/, /transporte/],
    [/netflix|spotify|disney|hbo|prime video|youtube|apple\.com|google one|icloud|deezer|assinatura/, /assinaturas/], [/farmacia|drogaria|hospital|clinica|laborat|dentist|unimed|amil/, /saude/],
    [/ifood|rappi|restaurante|lanchonete|burger|pizza|cafe|bar /, /lazer/], [/aluguel|condominio|iptu|imobili/, /moradia/], [/escola|faculdade|curso|udemy|alura|livraria/, /educacao/],
    [/amazon|mercado ?livre|shopee|aliexpress|magalu|americanas|shein/, /compras online/], [/energia|enel|cpfl|sabesp|agua|internet|vivo|claro|tim |oi /, /contas/], [/pix|ted|doc/, /pix/],
  ];
  const fallback = byName(/^outros$/) || data.categories.find((c) => c.kind === "both" || c.kind === "expense");
  return (type, description, pluggyCategory) => {
    const m = hist.get(`${type}|${keyOf(description)}`); // 1º: como o usuário já categorizou algo igual
    if (m) return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const pc = norm(pluggyCategory || "");
    if (type === "income") return (/salary|payroll|wage|^income$/.test(pc) || /salario|folha de pagamento|holerite|proventos/.test(norm(description)) ? byName(/salario/) : null)?.id || fallback?.id || null;
    for (const [re, name] of PLUGGY_MAP) if (re.test(pc)) { const c = byName(name); if (c) return c.id; } // 2º: categoria do Pluggy
    const text = norm(description);
    for (const [re, name] of KEYWORDS) if (re.test(text)) { const c = byName(name); if (c) return c.id; } // 3º: palavras da descrição
    return fallback?.id || null;
  };
}

function findOrCreateAccount(data, connector, a, hint = null) {
  const type = hubAccountType(a);
  const bank = institutionName(connector, a, hint); // MeuPluggy: o banco vem da conta (ou do item); conector direto: do conector
  let acc = data.accounts.find((x) => x.openFinanceId === a.id);
  if (!acc) {
    // liga a um cartão/conta que o usuário já cadastrou à mão (mesmo banco e tipo) em vez de duplicar
    const tok = bankToken(bank);
    if (tok) acc = data.accounts.find((x) => !x.archived && !x.openFinanceId && x.type === type && new RegExp(`(^|\\s)${tok}(\\s|$)`).test(norm(x.name)));
    if (acc) acc.linkedFrom = "manual";
  }
  if (!acc) {
    acc = { id: "acct_" + Math.random().toString(36).slice(2, 10), name: accountName(bank, a), type, color: bankColor(bank), source: "openfinance", balance: 0, archived: false, createdAt: new Date().toISOString() };
    data.accounts.push(acc);
  }
  acc.openFinanceId = a.id;
  acc.ofItemId = a.itemId;
  acc.institution = connector ? { name: bank, imageUrl: /meu ?pluggy/i.test(connector.name || "") ? acc.institution?.imageUrl || null : connector.imageUrl || null } : acc.institution;
  const cd = a.creditData;
  acc.of = {
    balance: a.balance ?? null, currency: a.currencyCode || "BRL", syncedAt: new Date().toISOString(), number: a.number || null, owner: a.owner || null,
    ...(cd ? { creditLimit: cd.creditLimit ?? null, availableCreditLimit: cd.availableCreditLimit ?? null, usedLimit: cd.creditLimit != null && cd.availableCreditLimit != null ? round2(cd.creditLimit - cd.availableCreditLimit) : null, closeDate: dateBR(cd.balanceCloseDate), dueDate: dateBR(cd.balanceDueDate), minimumPayment: cd.minimumPayment ?? null, brand: cd.brand || null } : {}),
  };
  if (type !== "credit_card" && a.balance != null) acc.balance = round2(a.balance);
  // duas contas com o mesmo nome (ex.: BTG tem duas): acrescenta o final do número para distinguir
  if (data.accounts.some((x) => x !== acc && !x.archived && x.name === acc.name)) {
    const tail = String(a.number || "").replace(/\D/g, "").slice(-4) || String(a.id).slice(0, 4);
    acc.name = `${acc.name} ·${tail}`;
  }
  return acc;
}

/** Sincroniza um banco (item): contas, transações novas/alteradas e (opcional) faturas. */
export async function syncItem(itemId, { full = false } = {}) {
  if (mem.syncing.has(itemId)) return mem.syncing.get(itemId);
  const run = (async () => {
    const item = await pl(`/items/${itemId}`);
    const connector = item.connector || {};
    const st0 = readState();
    const known = st0.items.find((i) => i.id === itemId);
    const result = { itemId, bank: connector.name, status: item.status, accounts: 0, added: 0, updated: 0, linked: 0, bills: 0 };
    if (["LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT", "WAITING_USER_ACTION"].includes(item.status) && !known?.lastSyncAt) {
      await mutateState((s) => { const i = s.items.find((x) => x.id === itemId); if (i) i.status = item.status; });
      throw err(item.status === "LOGIN_ERROR" ? "Não consegui entrar no banco (login recusado). Reconecte." : `O banco pede uma ação sua (${item.status}). Reconecte.`, 409);
    }

    const accounts = await paged("/accounts", { itemId });
    const data = await readFinance();
    const pick = categoryPicker(data);
    const since = full || !known?.lastSyncAt ? new Date(Date.now() - 120 * 864e5) : new Date(new Date(known.lastSyncAt).getTime() - 10 * 864e5);
    const from = since.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const byPluggy = new Map(data.transactions.filter((t) => t.pluggyId).map((t) => [t.pluggyId, t]));
    const now = today();

    const banks = new Set();
    const hint = accounts.map((x) => bankToken(`${x.marketingName || ""} ${x.name || ""}`)).find(Boolean) || null; // banco do item (MeuPluggy)
    // nome do titular (de todas as contas já conectadas + desta) e bancos conectados: para reconhecer movimentação própria
    const owners = new Set([...data.accounts.map((x) => x.of?.owner), ...accounts.map((x) => x.owner)].filter(Boolean));
    const connected = [...new Set([hint, ...data.accounts.filter((x) => x.openFinanceId).map((x) => bankToken(x.institution?.name || ""))].filter(Boolean))];
    const own = ownerMatcher(owners, connected);
    for (const a of accounts) {
      const hub = findOrCreateAccount(data, connector, { ...a, itemId }, hint);
      banks.add(hub.institution?.name || connector.name);
      result.accounts++;
      const txs = await txPaged(a.id, from);
      for (const raw of txs) {
        const m = mapTransaction(raw, a, { now, own });
        if (!m) continue;
        const cur = byPluggy.get(m.pluggyId);
        if (cur) {
          const ofTx = cur.source === "openfinance";
          // `manualTransfer` (true/false) é decisão do usuário/assistente e vale mais que a heurística da importação
          const wantTransfer = cur.manualTransfer !== undefined ? cur.manualTransfer : m.transfer;
          const changed = !!cur.pending !== !!m.pending || cur.amount !== m.amount || (ofTx && (cur.date !== m.date || cur.description !== m.description || !!cur.transfer !== !!wantTransfer));
          if (changed) { Object.assign(cur, { pending: m.pending, amount: m.amount, date: m.date, description: m.description, ...(ofTx ? { transfer: wantTransfer || undefined, pluggyCategory: m.category || cur.pluggyCategory } : {}), updatedAt: new Date().toISOString() }); result.updated++; }
          continue;
        }
        // mesmo lançamento já registrado à mão/pelo chat/OFX (mesma conta, valor, tipo e data +-1 dia): só vincula, não duplica
        const twin = data.transactions.find((t) => !t.archived && !t.pluggyId && t.accountId === hub.id && t.type === m.type && Math.abs(t.amount - m.amount) < 0.005 && Math.abs((Date.parse(t.date) - Date.parse(m.date)) / 864e5) <= 1);
        if (twin) { twin.pluggyId = m.pluggyId; byPluggy.set(m.pluggyId, twin); result.linked++; continue; }
        const t = { id: "txn_" + Math.random().toString(36).slice(2, 10), accountId: hub.id, categoryId: pick(m.type, m.description, m.category), type: m.type, amount: m.amount, date: m.date, description: m.description, source: "openfinance", pluggyId: m.pluggyId, pluggyCategory: m.category || undefined, pending: m.pending, transfer: m.transfer || undefined, installment: m.installment || undefined, recurring: null, archived: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        data.transactions.push(t); byPluggy.set(m.pluggyId, t); result.added++;
      }

      if (st0.settings.importBills && hubAccountType(a) === "credit_card") {
        let bills = [];
        try { bills = await paged("/bills", { accountId: a.id }); } catch { /* o banco pode não expor faturas */ }
        const cat = (data.categories.find((c) => norm(c.name) === "contas fixas") || data.categories.find((c) => norm(c.name) === "contas"))?.id || pick("expense", "fatura cartao", null);
        const r = applyCardBills(data, hub, a, bills, { now, categoryId: cat });
        result.bills += r.added;
      }
    }
    // contas a pagar cadastradas à mão que o extrato mostra como pagas
    const viaRules = applyRules(data, now); // vínculos "conta -> favorecido" que você confirmou
    const rec = reconcileBills(data, { now });
    result.reconciled = rec.auto.length + viaRules.paid;
    result.datedByBank = viaRules.dated;
    result.suggestions = rec.suggestions.slice(0, 40).map((c) => ({ billId: c.b.id, bill: c.b.name, due: c.b.dueDate, amount: c.b.amount, txnId: c.t.id, paid: c.t.date, paidAmount: c.t.amount, description: c.t.description.slice(0, 40), account: data.accounts.find((x) => x.id === c.t.accountId)?.name || "", conf: c.conf }));
    data.meta.openFinance = { ...(data.meta.openFinance || {}), lastSyncedAt: new Date().toISOString() };
    await writeFinance(data);
    await mutateState((s) => {
      let i = s.items.find((x) => x.id === itemId);
      if (!i) { i = { id: itemId, createdAt: new Date().toISOString() }; s.items.push(i); }
      Object.assign(i, { bankNames: [...banks], connector: { id: connector.id, name: connector.name, imageUrl: connector.imageUrl || null, primaryColor: connector.primaryColor || null }, status: item.status, lastSyncAt: new Date().toISOString(), accountIds: accounts.map((x) => x.id), lastError: null, lastResult: { accounts: result.accounts, added: result.added, updated: result.updated, linked: result.linked, bills: result.bills } });
      s.lastSync = new Date().toISOString();
      s.reconcile = { at: new Date().toISOString(), auto: result.reconciled || 0, suggestions: result.suggestions || [] };
    });
    emit("finance");
    return result;
  })().catch(async (e) => {
    await mutateState((s) => { const i = s.items.find((x) => x.id === itemId); if (i) i.lastError = { at: new Date().toISOString(), message: String(e.message).slice(0, 200) }; }).catch(() => {});
    throw e;
  }).finally(() => mem.syncing.delete(itemId));
  mem.syncing.set(itemId, run);
  return run;
}

/** Depois do widget: registra o banco conectado e já puxa os dados. */
export async function registerItem(itemId) {
  if (!/^[0-9a-f-]{20,}$/i.test(String(itemId))) throw err("Item inválido.");
  const item = await pl(`/items/${itemId}`);
  await mutateState((s) => { if (!s.items.find((i) => i.id === itemId)) s.items.push({ id: itemId, createdAt: new Date().toISOString(), connector: { id: item.connector?.id, name: item.connector?.name, imageUrl: item.connector?.imageUrl || null }, status: item.status }); });
  return syncItem(itemId, { full: true });
}

export async function syncAll({ full = false } = {}) {
  const st = readState();
  const out = [];
  for (const i of st.items) {
    try { out.push(await syncItem(i.id, { full })); } catch (e) { out.push({ itemId: i.id, bank: i.connector?.name, error: e.message }); }
  }
  return out;
}

/** Pede ao Pluggy para atualizar o banco agora (consulta o Open Finance) e espera terminar (até ~90 s). */
export async function refreshItem(itemId) {
  await pl(`/items/${itemId}`, { method: "PATCH", body: {} });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const it = await pl(`/items/${itemId}`);
    if (it.status !== "UPDATING") break;
  }
  return syncItem(itemId);
}

export async function removeItem(itemId) {
  try { await pl(`/items/${itemId}`, { method: "DELETE" }); } catch (e) { if (e.status !== 404) throw e; }
  await mutateState((s) => { s.items = s.items.filter((i) => i.id !== itemId); });
  const data = await readFinance();
  for (const a of data.accounts) if (a.ofItemId === itemId) { delete a.ofItemId; if (a.source === "openfinance") a.archived = true; }
  await writeFinance(data);
}

export const setSettings = (patch) => mutateState((s) => { s.settings = { ...s.settings, importBills: !!(patch.importBills ?? s.settings.importBills), autoSync: !!(patch.autoSync ?? s.settings.autoSync) }; });

/** Aviso do Pluggy (webhook): sincroniza o banco indicado, com um pequeno atraso para juntar eventos em sequência. */
export function onWebhook(evt) {
  const itemId = evt?.itemId || evt?.data?.itemId || evt?.data?.id;
  if (!itemId) return { ok: true, ignored: true };
  clearTimeout(mem.timers.get(itemId));
  mem.timers.set(itemId, setTimeout(async () => {
    mem.timers.delete(itemId);
    try {
      const known = readState().items.some((i) => i.id === itemId);
      if (!known) await registerItem(itemId); else await syncItem(itemId);
    } catch (e) { console.error("[pluggy webhook]", e.message); }
  }, 15_000));
  return { ok: true, scheduled: true };
}

/** Sincronização automática: a cada 4 h (e na subida, se passou de 4 h). Idempotente. */
export function ensureScheduler() {
  if (mem.scheduler || !configured()) return;
  mem.scheduler = true;
  const tick = async () => {
    const st = readState();
    if (!st.settings.autoSync || !st.items.length) return;
    if (st.lastSync && Date.now() - Date.parse(st.lastSync) < 3.5 * 3600_000) return;
    try { await syncAll(); } catch (e) { console.error("[pluggy sync]", e.message); }
  };
  setTimeout(tick, 45_000);
  setInterval(tick, 30 * 60_000);
}

export function publicStatus() {
  const st = readState();
  return {
    configured: configured(),
    items: st.items.map((i) => ({ id: i.id, name: (i.bankNames?.length ? i.bankNames.join(" + ") : i.connector?.name) || "Banco", via: /meu ?pluggy/i.test(i.connector?.name || "") ? "MeuPluggy" : null, imageUrl: i.connector?.imageUrl || null, status: i.status || null, lastSyncAt: i.lastSyncAt || null, accounts: (i.accountIds || []).length, lastError: i.lastError?.message || null, lastResult: i.lastResult || null })),
    settings: st.settings, lastSync: st.lastSync, reconcile: st.reconcile,
  };
}
