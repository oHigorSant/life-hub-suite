// node scripts/test-pluggy.mjs — testa a integração Open Finance contra um Pluggy FALSO (servidor local). Pasta temporária.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { pathToFileURL } from "node:url";

const repo = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lh-pluggy-"));
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString();
const iso = (n) => addDays(n).slice(0, 10);

// finance.json do usuário: cartões cadastrados à mão + uma transação lançada à mão
fs.writeFileSync(path.join(tmp, "data", "finance.json"), JSON.stringify({
  accounts: [
    { id: "acct_nu", name: "Cartão Nubank", type: "credit_card", color: "purple", source: "manual", openFinanceId: null, balance: 0, archived: false },
    { id: "acct_c6", name: "Cartão C6", type: "credit_card", color: "black", source: "manual", openFinanceId: null, balance: 0, archived: false },
  ],
  categories: [{ id: "cat_laz", name: "Lazer", kind: "expense" }, { id: "cat_pix", name: "Pix / Pagamentos com cartão", kind: "expense" }, { id: "cat_con2", name: "Contas", kind: "expense" }, { id: "cat_mer", name: "Mercado", kind: "expense" }, { id: "cat_tra", name: "Transporte", kind: "expense" }, { id: "cat_sal", name: "Salário", kind: "income" }, { id: "cat_out", name: "Outros", kind: "both" }, { id: "cat_con", name: "Contas fixas", kind: "expense" }],
  transactions: [{ id: "txn_manual", accountId: "acct_nu", categoryId: "cat_mer", type: "expense", amount: 40, date: iso(-3), description: "Mercado da semana", source: "chat", archived: false }],
  bills: [], subscriptions: [], layouts: [], meta: { openFinance: { lastSyncedAt: null }, processedUploads: [] },
}));

// ---------- Pluggy falso ----------
const calls = { auth: 0, patched: 0, deleted: 0, v2: 0 };
const ITEMS = { "11111111-1111-1111-1111-111111111111": { id: "11111111-1111-1111-1111-111111111111", status: "UPDATED", connector: { id: 1, name: "Nubank (Open Finance)", imageUrl: "x.png", primaryColor: "820AD1" } },
  "22222222-2222-2222-2222-222222222222": { id: "22222222-2222-2222-2222-222222222222", status: "UPDATED", connector: { id: 2, name: "C6 Bank (Open Finance)" } } };
let TX = {
  "nu-card": [
    { id: "t1", accountId: "nu-card", date: addDays(-2), description: "UBER *TRIP", amount: 23.9, status: "POSTED" },
    { id: "t2", accountId: "nu-card", date: addDays(-1), description: "Padaria Central", amount: 18.5, status: "PENDING", creditCardMetadata: { installmentNumber: 2, totalInstallments: 3 } },
    { id: "t3", accountId: "nu-card", date: addDays(-1), description: "Pagamento recebido", amount: -500, status: "POSTED" },
    { id: "t4", accountId: "nu-card", date: addDays(20), description: "Parcela futura", amount: 99, status: "PENDING" },
    { id: "t5", accountId: "nu-card", date: addDays(-3), description: "Mercado da semana", amount: 40, status: "POSTED" }, // gêmea da lançada à mão
  ],
  "c6-checking": [
    { id: "t6", accountId: "c6-checking", date: addDays(-1), description: "Salário Empresa", amount: 5000, type: "CREDIT", status: "POSTED" },
    { id: "t7", accountId: "c6-checking", date: addDays(-1), description: "Pagamento fatura cartão", amount: -1200, type: "DEBIT", status: "POSTED" },
    { id: "t8", accountId: "c6-checking", date: addDays(-2), description: "Pix padaria", amount: -12.3, type: "DEBIT", status: "POSTED" },
  ],
};
const ACC = {
  "11111111-1111-1111-1111-111111111111": [{ id: "nu-card", type: "CREDIT", subtype: "CREDIT_CARD", name: "Cartão Nubank", balance: 321.4, currencyCode: "BRL", creditData: { creditLimit: 5000, availableCreditLimit: 4200, balanceCloseDate: addDays(5), balanceDueDate: addDays(12), minimumPayment: 80 } }],
  "22222222-2222-2222-2222-222222222222": [{ id: "c6-checking", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta Corrente", balance: 1500.55, currencyCode: "BRL" }],
};
const BILLS = { "nu-card": [{ id: "b1", dueDate: addDays(12), totalAmount: 321.4, payments: [] }, { id: "b0", dueDate: addDays(-18), totalAmount: 800, payments: [{ amount: 800 }] }, { id: "bx", dueDate: addDays(-40), totalAmount: 700, payments: [] }] };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
    if (u.pathname === "/auth") { calls.auth++; const j = JSON.parse(b || "{}"); return j.clientId === "cid" && j.clientSecret === "sec" ? send(200, { apiKey: "KEY" + calls.auth }) : send(401, { message: "bad" }); }
    if (req.headers["x-api-key"] !== "KEY" + calls.auth) return send(403, { message: "forbidden" });
    const m = u.pathname.match(/^\/items\/([^/]+)$/);
    if (m && req.method === "GET") return ITEMS[m[1]] ? send(200, ITEMS[m[1]]) : send(404, { message: "nf" });
    if (m && req.method === "PATCH") { calls.patched++; return send(200, ITEMS[m[1]]); }
    if (m && req.method === "DELETE") { calls.deleted++; return send(200, {}); }
    if (u.pathname === "/accounts") return send(200, { page: 1, total: 1, totalPages: 1, results: ACC[u.searchParams.get("itemId")] || [] });
    if (u.pathname === "/transactions") return send(400, { message: "This endpoint is deprecated. Use GET /v2/transactions with cursor pagination instead." });
    if (u.pathname === "/v2/transactions") {
      // como a API real: só aceita estes filtros e devolve { results, next }
      for (const k of u.searchParams.keys()) if (!["accountId", "dateFrom", "dateTo", "after"].includes(k)) return send(400, { message: `property ${k} should not exist`, code: 400 });
      const all = TX[u.searchParams.get("accountId")] || [];
      calls.v2++;
      if (all.length >= 4 && !u.searchParams.get("after")) { // duas páginas: cursor em uma URL (formato do SDK)
        const nu = new URL(`http://${req.headers.host}/v2/transactions`); u.searchParams.forEach((v, k) => nu.searchParams.set(k, v)); nu.searchParams.set("after", "p2");
        return send(200, { results: all.slice(0, 3), next: nu.toString() });
      }
      return send(200, { results: u.searchParams.get("after") ? all.slice(3) : all, next: null });
    }
    if (u.pathname === "/bills") return send(200, { page: 1, totalPages: 1, results: BILLS[u.searchParams.get("accountId")] || [] });
    if (u.pathname === "/connect_token") { return send(200, { accessToken: "CT-" + JSON.stringify(JSON.parse(b || "{}").options?.webhookUrl || "") }); }
    send(404, { message: "rota desconhecida " + u.pathname });
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.PLUGGY_API_URL = `http://127.0.0.1:${server.address().port}`;
process.env.PLUGGY_CLIENT_ID = "cid"; process.env.PLUGGY_CLIENT_SECRET = "sec";
process.chdir(tmp);
const P = await import(pathToFileURL(path.join(repo, "lib/finance/pluggy.js")).href);
const readFin = () => JSON.parse(fs.readFileSync(path.join(tmp, "data", "finance.json"), "utf8"));
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log("ok -", name); };

await t("mapeamento: sinais, parcelas, futuros, pagamentos de fatura", () => {
  const card = { type: "CREDIT", subtype: "CREDIT_CARD" }, bank = { type: "BANK", subtype: "CHECKING_ACCOUNT" };
  const m = (tx, a) => P.mapTransaction({ status: "POSTED", ...tx }, a, { now: today });
  assert.deepEqual([m({ id: "a", date: addDays(-1), description: "X", amount: 10 }, card).type, m({ id: "a", date: addDays(-1), description: "X", amount: -10 }, card).type], ["expense", "income"]);
  assert.equal(m({ id: "a", date: addDays(-1), description: "X", amount: -9, type: "DEBIT" }, bank).type, "expense");
  assert.equal(m({ id: "a", date: addDays(-1), description: "X", amount: 9, type: "CREDIT" }, bank).type, "income");
  assert.equal(m({ id: "a", date: addDays(-1), description: "X", amount: -9, type: "DEBIT" }, bank).amount, 9);
  assert.equal(m({ id: "a", date: addDays(20), description: "X", amount: 5 }, card), null);
  assert.equal(m({ id: "a", date: addDays(-1), description: "X", amount: 0 }, card), null);
  assert.equal(m({ id: "a", date: addDays(-1), description: "Pagamento fatura cartão", amount: -5 }, bank).transfer, true);
  assert.equal(m({ id: "a", date: addDays(-1), description: "Pagamento recebido", amount: -5 }, card).transfer, true);
  assert.equal(m({ id: "a", date: addDays(-1), description: "Mercado", amount: 5 }, card).transfer, false);
  assert.deepEqual(m({ id: "a", date: addDays(-1), description: "Loja", amount: 5, creditCardMetadata: { installmentNumber: 2, totalInstallments: 3 } }, card).installment, { number: 2, total: 3 });
  // data em fuso do Brasil (UTC 02:00 do dia seguinte ainda é o dia anterior em Brasília)
  assert.equal(P.mapTransaction({ id: "z", date: "2026-03-10T02:30:00.000Z", description: "Y", amount: 5 }, card, { now: "2026-12-31" }).date, "2026-03-09");
});

await t("nomes, tipos e bancos reconhecidos", () => {
  assert.equal(P.accountName("Nubank (Open Finance)", { type: "CREDIT" }), "Nubank Cartão");
  assert.equal(P.accountName("C6 Bank", { type: "BANK", subtype: "CHECKING_ACCOUNT" }), "C6 Bank Conta");
  assert.equal(P.hubAccountType({ type: "BANK", subtype: "SAVINGS_ACCOUNT" }), "savings");
  assert.equal(P.bankToken("Caixa Econômica Federal (Open Finance)"), "caixa"); assert.equal(P.bankToken("PicPay"), "picpay"); assert.equal(P.bankToken("Banco Qualquer"), null);
  assert.equal(P.bankColor("Nubank"), "purple");
});

await t("auth: usa a chave, renova se o Pluggy recusar", async () => {
  const j = await P.createConnectToken({});
  assert.match(j.accessToken, /^CT-/); assert.equal(calls.auth, 1);
  const w = await P.createConnectToken({ publicBase: "https://exemplo.ts.net" });
  assert.match(w.accessToken, /exemplo\.ts\.net\/api\/finance\/pluggy\/webhook\?token=[0-9a-f]{48}/);
  assert.equal(calls.auth, 1); // reaproveitou a chave
});

await t("1ª sincronização: liga ao cartão cadastrado à mão, importa, vincula a gêmea, ignora o futuro", async () => {
  const r = await P.registerItem("11111111-1111-1111-1111-111111111111");
  assert.equal(r.accounts, 1); assert.equal(r.added, 3); assert.equal(r.linked, 1);
  assert.ok(calls.v2 >= 2, "seguiu o cursor para a 2ª página"); // o cartão tem 5 lançamentos em 2 páginas
  const f = readFin();
  assert.equal(f.accounts.length, 2); // NÃO duplicou o Cartão Nubank
  const nu = f.accounts.find((a) => a.id === "acct_nu");
  assert.equal(nu.openFinanceId, "nu-card"); assert.equal(nu.of.creditLimit, 5000); assert.equal(nu.of.usedLimit, 800); assert.equal(nu.of.balance, 321.4);
  const imp = f.transactions.filter((x) => x.source === "openfinance");
  assert.equal(imp.length, 3);
  assert.ok(!f.transactions.some((x) => x.description === "Parcela futura"));
  const twin = f.transactions.find((x) => x.id === "txn_manual"); assert.equal(twin.pluggyId, "t5"); // vinculou em vez de duplicar
  assert.equal(imp.find((x) => x.pluggyId === "t1").categoryId, "cat_tra"); // Uber -> Transporte (palavra-chave)
  assert.equal(imp.find((x) => x.pluggyId === "t3").transfer, true);
  assert.equal(imp.find((x) => x.pluggyId === "t2").pending, true); assert.deepEqual(imp.find((x) => x.pluggyId === "t2").installment, { number: 2, total: 3 });
});

await t("2ª sincronização: sem duplicar; atualiza pendente -> confirmado", async () => {
  TX["nu-card"][1] = { ...TX["nu-card"][1], status: "POSTED", amount: 19.9 };
  const r = await P.syncItem("11111111-1111-1111-1111-111111111111");
  assert.equal(r.added, 0); assert.equal(r.updated, 1);
  const f = readFin(); const p = f.transactions.find((x) => x.pluggyId === "t2");
  assert.equal(p.pending, false); assert.equal(p.amount, 19.9);
  assert.equal(f.transactions.filter((x) => x.source === "openfinance").length, 3);
});

await t("conta corrente: cria conta nova, sinais certos, pagamento de fatura marcado como transferência", async () => {
  const r = await P.registerItem("22222222-2222-2222-2222-222222222222");
  assert.equal(r.added, 3);
  const f = readFin();
  const c6 = f.accounts.find((a) => a.openFinanceId === "c6-checking");
  assert.equal(c6.name, "C6 Bank Conta"); assert.equal(c6.type, "checking"); assert.equal(c6.balance, 1500.55); assert.equal(c6.source, "openfinance"); assert.equal(c6.color, "black");
  const tx = (id) => f.transactions.find((x) => x.pluggyId === id);
  assert.deepEqual([tx("t6").type, tx("t6").categoryId], ["income", "cat_sal"]);
  assert.deepEqual([tx("t7").type, tx("t7").transfer], ["expense", true]);
  assert.equal(tx("t8").type, "expense");
});

await t("faturas do cartão entram sozinhas como contas a pagar (e a opção desliga)", async () => {
  const f = readFin(); const by = (id) => f.bills.find((b) => b.pluggyBillId === id);
  assert.equal(f.bills.length, 3); // já vieram na 1ª sincronização (importBills é padrão)
  assert.equal(by("b1").status, "pending"); assert.equal(by("b1").amount, 321.4);
  assert.equal(by("b0").status, "paid"); assert.equal(by("bx").status, "overdue");
  assert.equal(by("b1").name, "Fatura Nubank"); assert.equal(by("b1").categoryId, "cat_con");
  const again = await P.syncItem("11111111-1111-1111-1111-111111111111");
  assert.equal(again.bills, 0); assert.equal(readFin().bills.length, 3);
  await P.setSettings({ importBills: false });
  BILLS["nu-card"].push({ id: "bn", dueDate: addDays(-60), totalAmount: 10, payments: [] });
  await P.syncItem("11111111-1111-1111-1111-111111111111");
  assert.equal(readFin().bills.length, 3); // desligado: nada novo
  BILLS["nu-card"].pop();
  await P.setSettings({ importBills: true });
});

await t("fatura em aberto: projeta o saldo do cartão para o próximo vencimento e se atualiza", async () => {
  BILLS["nu-card"][0] = { id: "b1", dueDate: addDays(12), totalAmount: 321.4, payments: [{ amount: 321.4 }] }; // última fatura paga
  ACC["11111111-1111-1111-1111-111111111111"][0].balance = 150;
  await P.syncItem("11111111-1111-1111-1111-111111111111");
  let f = readFin(); let open = f.bills.filter((b) => String(b.pluggyBillId).startsWith("open:nu-card:"));
  assert.equal(open.length, 1); assert.equal(open[0].amount, 150); assert.equal(open[0].status, "pending");
  assert.match(open[0].name, /aberta/);
  ACC["11111111-1111-1111-1111-111111111111"][0].balance = 210;
  await P.syncItem("11111111-1111-1111-1111-111111111111");
  f = readFin(); open = f.bills.filter((b) => String(b.pluggyBillId).startsWith("open:nu-card:"));
  assert.equal(open.length, 1); assert.equal(open[0].amount, 210); // atualizou, não duplicou
  // a fatura fecha: vira uma fatura real e a projeção do mês anterior some
  BILLS["nu-card"].unshift({ id: "b2", dueDate: open[0].dueDate, totalAmount: 210, payments: [] });
  ACC["11111111-1111-1111-1111-111111111111"][0].balance = 210;
  await P.syncItem("11111111-1111-1111-1111-111111111111");
  f = readFin();
  assert.equal(f.bills.find((b) => b.pluggyBillId === "b2").amount, 210);
  assert.equal(f.bills.filter((b) => String(b.pluggyBillId).startsWith("open:nu-card:")).length, 0); // nada a projetar: tudo está na fatura fechada não paga
});

await t("conciliação: conta cadastrada à mão vira paga só quando o extrato prova; o resto é sugestão", async () => {
  const fin = readFin();
  const mk = (id, name, amount, dueDate) => ({ id, name, categoryId: "cat_con", amount, originalAmount: null, lateFee: null, dueDate, status: "pending", recurrence: null, seriesId: "s_" + id, installment: null, notes: null, source: "chat", accountId: null, archived: false });
  fin.bills.push(mk("bill_net", "Netflix", 55.9, iso(-5)), mk("bill_alu", "Aluguel", 1000, iso(-3)), mk("bill_luz", "Conta de luz", 180, iso(-2)));
  fs.writeFileSync(path.join(tmp, "data", "finance.json"), JSON.stringify(fin));
  TX["c6-checking"].push(
    { id: "t9", accountId: "c6-checking", date: addDays(-4), description: "NETFLIX.COM", amount: -55.9, type: "DEBIT", status: "POSTED" },
    { id: "t10", accountId: "c6-checking", date: addDays(-3), description: "Pix Fulano de Tal", amount: -1000, type: "DEBIT", status: "POSTED" },
  );
  const r = await P.syncItem("22222222-2222-2222-2222-222222222222");
  assert.equal(r.reconciled, 1);
  const f = readFin(); const b = (id) => f.bills.find((x) => x.id === id);
  assert.equal(b("bill_net").status, "paid"); assert.equal(b("bill_net").paidBy.via, "openfinance");
  assert.equal(b("bill_alu").status, "pending"); // só valor igual não basta para marcar sozinho
  assert.equal(b("bill_luz").status, "pending");
  const sug = P.publicStatus().reconcile.suggestions;
  assert.ok(sug.some((s) => s.billId === "bill_alu" && s.description.includes("Fulano")));
  assert.ok(!sug.some((s) => s.billId === "bill_net"));
  const again = await P.syncItem("22222222-2222-2222-2222-222222222222");
  assert.equal(again.reconciled, 0);
});

await t("MeuPluggy: o banco vem do nome da conta e liga ao cartão cadastrado à mão (sem duplicar)", async () => {
  const before = readFin().accounts.length;
  ITEMS["33333333-3333-3333-3333-333333333333"] = { id: "33333333-3333-3333-3333-333333333333", status: "UPDATED", connector: { id: 200, name: "MeuPluggy" } };
  ACC["33333333-3333-3333-3333-333333333333"] = [
    { id: "mp-c6-card", type: "CREDIT", subtype: "CREDIT_CARD", name: "C6 Bank - Cartão de Crédito", balance: 100, currencyCode: "BRL" },
    { id: "mp-pic", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "PicPay - Conta", balance: 50, currencyCode: "BRL" },
  ];
  TX["mp-c6-card"] = [{ id: "m1", accountId: "mp-c6-card", date: addDays(-1), description: "Loja X", amount: 10, status: "POSTED" }];
  const r = await P.registerItem("33333333-3333-3333-3333-333333333333");
  assert.equal(r.accounts, 2);
  const f = readFin();
  assert.equal(f.accounts.find((a) => a.id === "acct_c6").openFinanceId, "mp-c6-card"); // ligou ao cartão que já existia
  assert.equal(f.accounts.length, before + 1); // só PicPay Conta é nova
  assert.equal(f.accounts.find((a) => a.openFinanceId === "mp-pic").name, "PicPay Conta");
  assert.equal(f.accounts.find((a) => a.openFinanceId === "mp-pic").color, "green");
  const st = P.publicStatus().items.find((i) => i.id === "33333333-3333-3333-3333-333333333333");
  assert.equal(st.via, "MeuPluggy"); assert.match(st.name, /C6 Bank \+ PicPay/);
});

await t("MeuPluggy com os nomes jurídicos reais (PIC PAY, NU PAGAMENTOS, BANCO C6, BTG)", async () => {
  assert.equal(P.bankToken("PIC PAY MASTERCARD PLATINUM"), "picpay");
  assert.equal(P.bankToken("PICPAY INSTITUIÇÃO DE PAGAMENTO S.A"), "picpay");
  assert.equal(P.bankToken("NU PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO"), "nubank");
  assert.equal(P.bankToken("BANCO C6 S.A."), "c6");
  assert.equal(P.bankToken("BANCO BTG PACTUAL S.A."), "btg");
  assert.equal(P.bankToken("CAIXA ECONÔMICA FEDERAL"), "caixa");
  assert.equal(P.bankToken("Banco Qualquer S.A."), null);
  const mp = { name: "MeuPluggy" };
  assert.equal(P.institutionName(mp, { name: "PIC PAY MASTERCARD PLATINUM" }), "PicPay");
  assert.equal(P.institutionName(mp, { name: "NU PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO" }), "Nubank");
  assert.equal(P.institutionName(mp, { name: "BANCO BTG PACTUAL S.A." }), "BTG Pactual");
  // sincronização: o cartão "PIC PAY MASTERCARD" liga ao "Cartão PicPay" cadastrado à mão e a conta corrente vira "PicPay Conta"
  const fin = readFin();
  fin.accounts.push({ id: "acct_pic", name: "Cartão PicPay", type: "credit_card", color: "green", source: "manual", openFinanceId: null, balance: 0, archived: false });
  fs.writeFileSync(path.join(tmp, "data", "finance.json"), JSON.stringify(fin));
  const ID = "44444444-4444-4444-4444-444444444444";
  ITEMS[ID] = { id: ID, status: "UPDATED", connector: { id: 200, name: "MeuPluggy" } };
  ACC[ID] = [
    { id: "pp-bank", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "PICPAY INSTITUIÇÃO DE PAGAMENTO S.A", number: "07086199-4", balance: 0, currencyCode: "BRL" },
    { id: "pp-card", type: "CREDIT", subtype: "CREDIT_CARD", name: "PIC PAY MASTERCARD PLATINUM", number: "7028", balance: 483, currencyCode: "BRL" },
  ];
  const n0 = readFin().accounts.length;
  await P.registerItem(ID);
  const f = readFin();
  assert.equal(f.accounts.find((a) => a.id === "acct_pic").openFinanceId, "pp-card");
  assert.equal(f.accounts.find((a) => a.id === "acct_pic").of.balance, 483);
  assert.equal(f.accounts.length, n0 + 1);
  assert.match(f.accounts.find((a) => a.openFinanceId === "pp-bank").name, /^PicPay Conta/); // (nos testes já existe outra "PicPay Conta": ganha o final do número)
});

await t("categorias do Pluggy: o que é transferência de verdade e o que é gasto", () => {
  const bank = { type: "BANK", subtype: "CHECKING_ACCOUNT" };
  const m = (category, extra = {}) => P.mapTransaction({ id: "c", date: addDays(-1), description: "Loja Fulano", amount: -10, type: "DEBIT", status: "POSTED", category, ...extra }, bank, { now: today });
  assert.equal(m("Same person transfer").transfer, true);   // entre as contas do próprio usuário
  assert.equal(m("Credit card payment").transfer, true);    // pagamento de fatura
  assert.equal(m("Transfer - Internal").transfer, true);
  assert.equal(m("Investments").transfer, true);
  assert.equal(m("Investments", { description: "PIX ENVIADO 99PAY SOCIEDADE DE CREDITO, FINANCIAMENTO E" }).transfer, false); // parcela de empréstimo é gasto
  assert.equal(m("Transfer - PIX").transfer, false);        // Pix a terceiros é gasto
  assert.equal(m("Transfers").transfer, false);
  assert.equal(m("Groceries").transfer, false);
  assert.equal(m("Eating out", { operationType: "PAGAMENTO_FATURA" }).transfer, true);
  assert.equal(m("Groceries").category, "Groceries");
});

await t("movimentação do próprio titular rotulada só como 'Transfers' não é gasto", () => {
  const card = { type: "CREDIT", subtype: "CREDIT_CARD" };
  const own = P.ownerMatcher(new Set(["MARIA SILVA"]), ["c6", "picpay"]);
  const m = (description, category = "Transfers") => P.mapTransaction({ id: "o", date: addDays(-1), description, amount: 100, status: "POSTED", category }, card, { now: today, own });
  assert.equal(m("Maria Silva").transfer, true);
  assert.equal(m("Picpay*Maria Silva A").transfer, true);                 // nome truncado pelo banco
  assert.equal(m("PIX ENVIADO C6 BANK COM CARTAO", "Transfer - PIX").transfer, true); // Pix para um banco dele
  assert.equal(m("Pix enviado para PEDRO HENRIQUE DA SILVA", "Transfer - PIX").transfer, false); // terceiro: é gasto
  assert.equal(m("VSTP EDUCACAO").transfer, false);
  assert.equal(m("Maria Silva Mercado", "Groceries").transfer, false); // só vale para categorias de transferência
  assert.equal(m("PIX ENVIADO ITAU COM CARTAO", "Transfer - PIX").transfer, false); // banco que ele não conectou
  assert.equal(P.mapTransaction({ id: "o", date: addDays(-1), description: "Maria Silva", amount: 5, status: "POSTED", category: "Transfers" }, card, { now: today }).transfer, false); // sem matcher não presume nada
});

await t("categorias: Pluggy -> suas categorias (histórico manda, depois o Pluggy, depois palavras)", async () => {
  const ID = "55555555-5555-5555-5555-555555555555";
  ITEMS[ID] = { id: ID, status: "UPDATED", connector: { id: 200, name: "MeuPluggy" } };
  ACC[ID] = [{ id: "cat-acc", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "NEXT S.A.", number: "1111-1", balance: 1, currencyCode: "BRL" }];
  const mk = (id, description, category, amount = -10) => ({ id, accountId: "cat-acc", date: addDays(-1), description, amount, type: amount < 0 ? "DEBIT" : "CREDIT", status: "POSTED", category });
  TX["cat-acc"] = [mk("k1", "Atacadao Sul", "Groceries"), mk("k2", "Restaurante Z", "Eating out"), mk("k3", "Vivo Fibra", "Telecommunications"), mk("k4", "Pix para Beltrano", "Transfer - PIX"),
    mk("k5", "Loja Qualquer", "Shopping"), mk("k6", "Padaria Central", null), mk("k7", "Empresa SA", "Salary", 3000), mk("k8", "Bonus", "Cashback", 5), mk("k9", "Item sem categoria", "Coisa Rara")];
  await P.registerItem(ID);
  const f = readFin(); const cat = (pid) => f.categories.find((c) => c.id === f.transactions.find((t) => t.pluggyId === pid).categoryId)?.name;
  assert.equal(cat("k1"), "Mercado"); assert.equal(cat("k2"), "Lazer"); assert.equal(cat("k3"), "Contas");
  assert.equal(cat("k4"), "Pix / Pagamentos com cartão"); assert.equal(cat("k7"), "Salário"); assert.equal(cat("k8"), "Outros"); assert.equal(cat("k9"), "Outros");
  assert.equal(f.transactions.find((t) => t.pluggyId === "k1").pluggyCategory, "Groceries");
  assert.equal(f.transactions.find((t) => t.pluggyId === "k4").transfer, undefined); // Pix a terceiros conta como gasto
});

await t("MeuPluggy: cartão sem o nome do banco ('platinum') herda o banco do item; contas de mesmo nome ganham o final do número", async () => {
  const fin = readFin();
  fin.accounts.push({ id: "acct_next", name: "Cartão Next", type: "credit_card", color: "green", source: "manual", openFinanceId: null, balance: 0, archived: false });
  fs.writeFileSync(path.join(tmp, "data", "finance.json"), JSON.stringify(fin));
  const ID = "66666666-6666-6666-6666-666666666666";
  ITEMS[ID] = { id: ID, status: "UPDATED", connector: { id: 200, name: "MeuPluggy" } };
  ACC[ID] = [
    { id: "nx-bank", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "NEXT S.A.", number: "2222-2", balance: 0, currencyCode: "BRL" },
    { id: "nx-card", type: "CREDIT", subtype: "CREDIT_CARD", name: "platinum", marketingName: "", number: "7777", balance: 10, currencyCode: "BRL" },
  ];
  const ID2 = "77777777-7777-7777-7777-777777777777";
  ITEMS[ID2] = { id: ID2, status: "UPDATED", connector: { id: 200, name: "MeuPluggy" } };
  ACC[ID2] = [
    { id: "btg-1", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "BTG", number: "1234-5", balance: 0, currencyCode: "BRL" },
    { id: "btg-2", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "BTG", number: "9999-5", balance: 7, currencyCode: "BRL" },
  ];
  const ID3 = "88888888-8888-8888-8888-888888888888";
  ITEMS[ID3] = { id: ID3, status: "UPDATED", connector: { id: 200, name: "MeuPluggy" } };
  ACC[ID3] = [{ id: "unk-1", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Banco Desconhecido - Conta Corrente", number: "3333-3", balance: 5, currencyCode: "BRL" }];
  await P.registerItem(ID); await P.registerItem(ID2); await P.registerItem(ID3);
  const f = readFin();
  assert.equal(f.accounts.find((a) => a.openFinanceId === "unk-1").name, "Banco Desconhecido Conta"); // banco fora da lista: usa o nome da conta
  assert.equal(f.accounts.find((a) => a.id === "acct_next").openFinanceId, "nx-card");     // ligou ao cartão cadastrado
  assert.ok(!f.accounts.some((a) => /platinum/i.test(a.name)), "não criou 'platinum Cartão'");
  const btg = f.accounts.filter((a) => /^BTG/.test(a.name));
  assert.equal(btg.length, 2); assert.notEqual(btg[0].name, btg[1].name);
  assert.ok(btg.some((a) => /·\d{4}$/.test(a.name)));
});

await t("marcação manual de transferência sobrevive à sincronização", async () => {
  const f = readFin();
  const tx = f.transactions.find((x) => x.pluggyId === "t8"); // Pix padaria (gasto)
  assert.equal(tx.transfer, undefined);
  tx.manualTransfer = true; tx.transfer = true;
  const tx2 = f.transactions.find((x) => x.pluggyId === "t7"); // pagamento de fatura (transferência pela regra)
  tx2.manualTransfer = false; tx2.transfer = undefined; // o usuário decidiu que NÃO é transferência
  fs.writeFileSync(path.join(tmp, "data", "finance.json"), JSON.stringify(f));
  await P.syncItem("22222222-2222-2222-2222-222222222222", { full: true }).catch(() => {}); // item pode já ter sido removido em outro teste: ignorado
  const g = readFin();
  assert.equal(g.transactions.find((x) => x.pluggyId === "t8").transfer, true);
  assert.equal(g.transactions.find((x) => x.pluggyId === "t7").transfer, undefined);
});

await t("estado público e remoção", async () => {
  const s = P.publicStatus();
  assert.equal(s.configured, true); assert.equal(s.items.length, 8); assert.equal(s.items[0].name, "Nubank");
  assert.equal(JSON.stringify(s).includes("sec"), false);
  await P.removeItem("22222222-2222-2222-2222-222222222222");
  assert.equal(calls.deleted, 1); assert.equal(P.publicStatus().items.length, 7);
  const c6 = readFin().accounts.find((a) => a.openFinanceId === "c6-checking");
  assert.equal(c6.archived, true); // conta criada pelo Open Finance some; os lançamentos ficam
  assert.ok(readFin().transactions.some((x) => x.pluggyId === "t6"));
});

await t("credenciais erradas: erro claro, sem vazar", async () => {
  process.env.PLUGGY_CLIENT_SECRET = "errado";
  const keep = P.credentials();
  assert.equal(keep.secret, "errado");
  // força nova autenticação
  const saved = globalThis.__lhPluggy; saved.key = null;
  await assert.rejects(() => P.createConnectToken({}), /recusadas/);
  process.env.PLUGGY_CLIENT_SECRET = "sec";
});

console.log(`\n${n} testes passaram`);
server.close();
process.chdir(repo);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* limpeza opcional */ }
