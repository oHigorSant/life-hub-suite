"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Receipt, Repeat, LineChart, ListOrdered, Landmark, Eye, EyeOff, X } from "lucide-react";
import { useLive } from "@/components/live/liveClient.js";
import ChatPanel from "@/components/ChatPanel";
import { LABEL_COLORS } from "@/lib/constants";
import OfxImport from "@/components/finance/OfxImport.jsx";
import BankConnect from "@/components/finance/BankConnect.jsx";
import FxRecurring from "@/components/finance/FxRecurring.jsx";
import { Overview, Bills, Analysis, Transactions, Accounts } from "@/components/finance/FxViews.jsx";
import { Segmented } from "@/components/finance/FxParts.jsx";
import { api, brl, todayISO, ACCOUNT_TYPE_LABELS, monthLabel } from "@/components/finance/fx.js";
import { analyze } from "@/lib/finance/analytics.js";
import "@/components/finance/fx.css";

const TABS = [
  { value: "overview", label: "Visão geral", icon: <LayoutGrid size={15} /> },
  { value: "bills", label: "Contas a pagar", icon: <Receipt size={15} /> },
  { value: "recurring", label: "Fixas e assinaturas", icon: <Repeat size={15} /> },
  { value: "analysis", label: "Análise", icon: <LineChart size={15} /> },
  { value: "txns", label: "Lançamentos", icon: <ListOrdered size={15} /> },
  { value: "accounts", label: "Contas", icon: <Landmark size={15} /> },
];

function Sheet({ title, onClose, children }) {
  return (
    <div className="fx-sheet-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fx-sheet" role="dialog" aria-label={title}>
        <header><h3>{title}</h3><button type="button" className="fx-icon" onClick={onClose} aria-label="Fechar"><X size={16} /></button></header>
        {children}
      </div>
    </div>
  );
}

export default function FinanceClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [view, setView] = useState("board");
  const [tab, setTab] = useState("overview");
  const [sheet, setSheet] = useState(null); // "txn" | "account"
  const [showOfx, setShowOfx] = useState(false);
  const [showBanks, setShowBanks] = useState(false);
  const [autoConnect, setAutoConnect] = useState(false);
  const [accountFilter, setAccountFilter] = useState(null);
  const [hide, setHide] = useState(false);

  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get("conectar") === "1") { setAutoConnect(true); setShowBanks(true); } } catch { /* sem URL */ }
    try { setHide(localStorage.getItem("lifehub-hide-values") === "1"); const t = localStorage.getItem("lifehub-fin-tab"); if (t && TABS.some((x) => x.value === t)) setTab(t); } catch { /* sem storage */ }
  }, []);
  const goTab = (t) => { setTab(t); try { localStorage.setItem("lifehub-fin-tab", t); } catch { /* sem storage */ } };
  const toggleHide = () => setHide((p) => { const n = !p; try { localStorage.setItem("lifehub-hide-values", n ? "1" : "0"); } catch { /* sem storage */ } return n; });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/finance", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
      setError(null);
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useLive(["finance"], refresh); // o que o agente, o banco ou outra aba mudar aparece na hora

  // Cadastro de fixas/assinaturas: séries mensais antigas entram sozinhas (uma vez)
  useEffect(() => {
    if (!data) return;
    const known = new Set((data.subscriptions || []).map((s) => s.seriesId));
    const orphan = (data.bills || []).some((b) => !b.archived && b.seriesId && b.source !== "openfinance" && !known.has(b.seriesId) && b.recurrence?.freq === "monthly" && b.recurrence?.endDate === null);
    if (orphan) api("POST", "/api/finance/recurring", { op: "adopt" }).catch(() => {});
  }, [data]);

  const A = useMemo(() => (data ? analyze(data, todayISO()) : null), [data]);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast((t) => (t === msg ? null : t)), 3500); };
  /** Aplica a mudança na tela já, manda ao servidor e confere com o que ele devolveu. */
  async function act(optimistic, request, okMsg) {
    if (optimistic) setData((d) => { const c = structuredClone(d); optimistic(c); return c; });
    try { await request(); if (okMsg) notify(okMsg); } catch (e) { notify(`Não deu: ${e.message}`); }
    refresh();
  }

  const onToggleBill = (bill) => act((d) => { const b = d.bills.find((x) => x.id === bill.id); if (b) b.status = bill.status === "paid" ? "pending" : "paid"; }, () => api("PATCH", "/api/finance/bills", { billId: bill.id, status: bill.status === "paid" ? "pending" : "paid" }));
  const onEditBill = (bill, patch) => act((d) => { const b = d.bills.find((x) => x.id === bill.id); if (b) Object.assign(b, patch); }, () => api("PATCH", "/api/finance/bills", { billId: bill.id, ...patch }), "Valor atualizado");
  const onBulk = (ids, status) => act((d) => { for (const b of d.bills) if (ids.includes(b.id)) b.status = status; }, () => api("PATCH", "/api/finance/bills", { billIds: ids, status }), `${ids.length} conta(s) marcada(s) como paga(s)`);
  const onReconcile = (payload, okMsg) => act(null, () => api("POST", "/api/finance/reconcile", payload), okMsg);
  const onRecPatch =(id, patch) => act((d) => { const s = d.subscriptions.find((x) => x.id === id); if (s) Object.assign(s, patch); }, () => api("PATCH", "/api/finance/recurring", { id, ...patch }), patch.active === undefined ? "Atualizado nas contas futuras" : patch.active ? "Ligada e prevista de novo" : "Desligada: saiu da previsão");
  const onRecCreate = (v) => act(null, () => api("POST", "/api/finance/recurring", v), "Cadastrada e já na previsão");
  const onRecDelete = (id) => act((d) => { d.subscriptions = d.subscriptions.filter((s) => s.id !== id); }, () => api("DELETE", "/api/finance/recurring", { id }), "Excluída");
  const onTxPatch = (id, patch) => act((d) => { const t = d.transactions.find((x) => x.id === id); if (t) Object.assign(t, patch); }, () => api("PATCH", "/api/finance/transactions", { id, ...patch }));

  async function submitTxn(e) {
    e.preventDefault(); const f = e.target;
    await act(null, () => api("POST", "/api/finance/transactions", { accountId: f.accountId.value, categoryId: f.categoryId.value, type: f.type.value, amount: f.amount.value, date: f.date.value, description: f.description.value }), "Lançamento salvo");
    setSheet(null);
  }
  async function submitAccount(e) {
    e.preventDefault(); const f = e.target;
    await act(null, () => api("POST", "/api/finance/accounts", { name: f.name.value, type: f.type.value, color: f.color.value }), "Conta criada");
    setSheet(null);
  }

  return (
    <div className={`app-shell view-${view}`}>
      <div className={`board-area finance-area fx${hide ? " fx-hide" : ""}`}>
        {error && <div className="fx-error">Erro ao carregar: {error}</div>}
        {data && A && (
          <div className="fx-scroll">
            <div className="fx-inner">
              <header className="fx-top">
                <div>
                  <p className="fx-eyebrow">{monthLabel(A.current.key)}</p>
                  <h1>Finanças</h1>
                </div>
                <div className="fx-top-actions">
                  <button type="button" className="fx-btn" onClick={toggleHide} aria-label={hide ? "Mostrar valores" : "Ocultar valores"}>{hide ? <EyeOff size={15} /> : <Eye size={15} />}{hide ? "Mostrar" : "Ocultar"}</button>
                  <button type="button" className="fx-btn primary" onClick={() => setSheet("txn")}>Lançar</button>
                </div>
              </header>
              <nav className="fx-tabs"><Segmented value={tab} onChange={goTab} options={TABS} /></nav>

              {tab === "overview" && <Overview data={data} A={A} onToggleBill={onToggleBill} goTab={goTab} />}
              {tab === "bills" && <Bills data={data} onToggleBill={onToggleBill} onEditBill={onEditBill} onBulk={onBulk} onReconcile={onReconcile} />}
              {tab === "recurring" && <FxRecurring data={data} A={A} onPatch={onRecPatch} onCreate={onRecCreate} onDelete={onRecDelete} />}
              {tab === "analysis" && <Analysis data={data} A={A} />}
              {tab === "txns" && <Transactions data={data} onTxPatch={onTxPatch} accountFilter={accountFilter} setAccountFilter={setAccountFilter} onAdd={() => setSheet("txn")} />}
              {tab === "accounts" && <Accounts data={data} A={A} onOpenAccount={(id) => { setAccountFilter(id); goTab("txns"); }} onBanks={() => setShowBanks(true)} onOfx={() => setShowOfx(true)} onAddAccount={() => setSheet("account")} />}
            </div>
          </div>
        )}
        {toast && <div className="fx-toast" role="status">{toast}</div>}
      </div>

      {sheet === "txn" && data && (
        <Sheet title="Novo lançamento" onClose={() => setSheet(null)}>
          <form className="fx-form" onSubmit={submitTxn}>
            <select name="type" defaultValue="expense"><option value="expense">Saída</option><option value="income">Entrada</option></select>
            <select name="accountId" required>{data.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select name="categoryId" required>{data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <input name="amount" type="number" step="0.01" min="0.01" placeholder="Valor" required />
            <input name="date" type="date" defaultValue={todayISO()} required />
            <input name="description" placeholder="Descrição (opcional)" />
            <button type="submit" className="fx-btn primary">Salvar</button>
          </form>
        </Sheet>
      )}
      {sheet === "account" && (
        <Sheet title="Nova conta" onClose={() => setSheet(null)}>
          <form className="fx-form" onSubmit={submitAccount}>
            <input name="name" placeholder="Nome (ex: Nubank)" required />
            <select name="type" defaultValue="checking">{Object.entries(ACCOUNT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <select name="color" defaultValue="purple">{Object.keys(LABEL_COLORS).map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <button type="submit" className="fx-btn primary">Salvar</button>
          </form>
        </Sheet>
      )}

      {showOfx && <OfxImport onClose={() => setShowOfx(false)} onDone={refresh} />}
      {showBanks && <BankConnect autoConnect={autoConnect} onClose={() => { setShowBanks(false); setAutoConnect(false); }} onChanged={refresh} />}
      <ChatPanel onMessageHandled={refresh} />

      <nav className="mobile-tabs">
        <button type="button" className={view === "board" ? "active" : ""} onClick={() => setView("board")}>Painel</button>
        <button type="button" className={view === "chat" ? "active" : ""} onClick={() => setView("chat")}>Chat</button>
      </nav>
    </div>
  );
}
