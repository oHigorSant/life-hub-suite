import { readFinance, writeFinance } from "../financeStore.js";
import { emit } from "../live/bus.js";
import { parseOfx } from "./ofx.js";

const err = (message, status = 400) => Object.assign(new Error(message), { status });

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
// "chave" de comparação: primeiras 3 palavras (ignora números de parcela, datas, códigos)
const keyOf = (d) => norm(d).split(" ").slice(0, 3).join(" ");
const PAYMENT_RE = /pagamento (recebido|efetuado|de fatura|fatura)|pgto fatura|payment received|credito em conta|estorno de/i;

function matchAccount(data, parsed) {
  const id = parsed.account.id;
  if (!id) return null;
  return data.accounts.find((a) => !a.archived && a.ofxAcctId && a.ofxAcctId === id) || null;
}

/** Lê o arquivo e monta a prévia (NADA é gravado): duplicatas, categoria sugerida e conta provável. */
export async function previewOfx(buffer, accountId) {
  const parsed = parseOfx(buffer);
  const data = await readFinance();
  const matched = matchAccount(data, parsed);
  const account = (accountId && data.accounts.find((a) => a.id === accountId)) || matched || null;

  // categoria mais usada para o mesmo "estabelecimento" no histórico
  const hist = new Map();
  for (const t of data.transactions) {
    if (t.archived || !t.categoryId) continue;
    const k = `${t.type}|${keyOf(t.description)}`;
    if (!k.endsWith("|")) { const m = hist.get(k) || new Map(); m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1); hist.set(k, m); }
  }
  const suggest = (t) => {
    const m = hist.get(`${t.type}|${keyOf(t.description)}`);
    return m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
  };

  const existing = data.transactions.filter((t) => !t.archived && (!account || t.accountId === account.id));
  const byFitid = new Set(existing.map((t) => t.fitid).filter(Boolean));
  const bySig = new Set(existing.map((t) => `${t.date}|${t.type}|${Number(t.amount).toFixed(2)}|${keyOf(t.description)}`));

  const isCardAccount = account ? account.type === "credit_card" : parsed.account.isCard;
  const rows = parsed.transactions.map((t, i) => {
    const dup = (t.fitid && byFitid.has(t.fitid)) || bySig.has(`${t.date}|${t.type}|${t.amount.toFixed(2)}|${keyOf(t.description)}`);
    const payment = isCardAccount && t.type === "income" && PAYMENT_RE.test(norm(t.description) + " " + t.description);
    return { idx: i, ...t, categoryId: suggest(t), duplicate: !!dup, payment: !!payment, selected: !dup && !payment };
  });
  return {
    file: { bank: parsed.bank, account: parsed.account, currency: parsed.currency, balance: parsed.balance, period: parsed.period },
    accountId: account?.id || null,
    accountMatched: !!matched,
    rows,
    accounts: data.accounts.filter((a) => !a.archived).map((a) => ({ id: a.id, name: a.name, type: a.type })),
    categories: data.categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    summary: {
      total: rows.length,
      duplicates: rows.filter((r) => r.duplicate).length,
      expenses: Math.round(rows.filter((r) => r.type === "expense").reduce((s, r) => s + r.amount, 0) * 100) / 100,
      income: Math.round(rows.filter((r) => r.type === "income").reduce((s, r) => s + r.amount, 0) * 100) / 100,
    },
  };
}

/** Grava os lançamentos confirmados na prévia. rows: [{ fitid, date, type, amount, description, categoryId }] */
export async function commitOfx({ accountId, newAccount, fileAccountId, rows, fileName }) {
  if (!Array.isArray(rows) || rows.length === 0) throw err("Nenhum lançamento selecionado.");
  if (rows.length > 5000) throw err("Arquivo grande demais (máximo de 5000 lançamentos por vez).");
  const data = await readFinance();
  const now = new Date().toISOString();

  let account = data.accounts.find((a) => a.id === accountId);
  if (!account) {
    const name = String(newAccount?.name || "").trim();
    if (!name) throw err("Escolha uma conta ou informe o nome da nova conta.");
    const TYPES = ["checking", "savings", "credit_card", "cash", "investment"];
    account = {
      id: "acct_" + Math.random().toString(36).slice(2, 10), name, type: TYPES.includes(newAccount?.type) ? newAccount.type : "checking",
      color: "blue", source: "manual", openFinanceId: null, balance: 0, archived: false, createdAt: now,
    };
    data.accounts.push(account);
  }
  if (fileAccountId && !account.ofxAcctId) account.ofxAcctId = String(fileAccountId); // próximos arquivos já caem nesta conta

  const catIds = new Set(data.categories.map((c) => c.id));
  const existing = new Set(data.transactions.filter((t) => !t.archived && t.accountId === account.id).map((t) => t.fitid).filter(Boolean));
  let added = 0, skipped = 0;
  for (const r of rows) {
    const amount = Number(r.amount);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || "") || !["expense", "income"].includes(r.type) || !Number.isFinite(amount) || amount <= 0) throw err("Lançamento inválido no arquivo.");
    if (!catIds.has(r.categoryId)) throw err(`Escolha a categoria de "${String(r.description || "").slice(0, 40)}".`);
    if (r.fitid && existing.has(r.fitid)) { skipped++; continue; }
    data.transactions.push({
      id: "txn_" + Math.random().toString(36).slice(2, 10), accountId: account.id, categoryId: r.categoryId, type: r.type, amount: Math.round(amount * 100) / 100,
      date: r.date, description: String(r.description || "").trim().slice(0, 200), source: "ofx", fitid: r.fitid || null, recurring: null,
      archived: false, createdAt: now, updatedAt: now,
    });
    if (r.fitid) existing.add(r.fitid);
    added++;
  }
  if (fileName) {
    data.meta.processedUploads = [...new Set([...(data.meta.processedUploads || []), String(fileName)])];
  }
  await writeFinance(data);
  emit("finance");
  return { ok: true, added, skipped, accountId: account.id };
}
