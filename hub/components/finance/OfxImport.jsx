"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, X, Check, AlertTriangle } from "lucide-react";
import "./ofx.css";

const brl = (n) => (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dmy = (ymd) => ymd.split("-").reverse().join("/");
const TYPE_LABEL = { checking: "Conta corrente", savings: "Poupança", credit_card: "Cartão de crédito", cash: "Dinheiro", investment: "Investimento" };

/** Importação de extrato/fatura em OFX: envia o arquivo, mostra a prévia (duplicatas marcadas) e só grava ao confirmar. */
export default function OfxImport({ onClose, onDone }) {
  const [step, setStep] = useState("pick"); // pick | preview | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pv, setPv] = useState(null);
  const [rows, setRows] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [newName, setNewName] = useState("");
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  async function send(file) {
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/finance/ofx", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao ler o arquivo.");
      setPv(j);
      setRows(j.rows);
      setAccountId(j.accountId || (j.accounts.length ? "" : "new"));
      setNewName(j.file.bank.org ? `${j.file.bank.org}${j.file.account.isCard ? " Cartão" : ""}` : "");
      setStep("preview");
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const expenseCats = useMemo(() => (pv ? pv.categories.filter((c) => c.kind === "expense" || c.kind === "both") : []), [pv]);
  const incomeCats = useMemo(() => (pv ? pv.categories.filter((c) => c.kind === "income" || c.kind === "both") : []), [pv]);
  const picked = rows.filter((r) => r.selected);
  const missing = picked.filter((r) => !r.categoryId).length;
  const upd = (idx, patch) => setRows((rs) => rs.map((r) => (r.idx === idx ? { ...r, ...patch } : r)));
  const bulkCat = (type, categoryId) => setRows((rs) => rs.map((r) => (r.type === type && r.selected && !r.categoryId ? { ...r, categoryId } : r)));

  async function commit() {
    setBusy(true); setError(null);
    try {
      const body = {
        op: "commit", fileName: pv.fileName, fileAccountId: pv.file.account.id,
        accountId: accountId === "new" ? null : accountId,
        newAccount: accountId === "new" ? { name: newName, type: pv.file.account.isCard ? "credit_card" : "checking" } : null,
        rows: picked.map((r) => ({ fitid: r.fitid, date: r.date, type: r.type, amount: r.amount, description: r.description, categoryId: r.categoryId })),
      };
      const r = await fetch("/api/finance/ofx", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Falha ao importar.");
      setResult(j); setStep("done"); onDone?.();
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const canCommit = picked.length > 0 && missing === 0 && (accountId && (accountId !== "new" || newName.trim())) && !busy;

  return (
    <div className="ofx-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ofx-modal" role="dialog" aria-modal="true" aria-label="Importar OFX">
        <header className="ofx-head">
          <h2>Importar extrato (OFX)</h2>
          <button type="button" className="ofx-x" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        {step === "pick" && (
          <div className="ofx-body">
            <div
              className={`ofx-drop${drag ? " on" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files?.[0]); }}
              onClick={() => input.current?.click()}
              role="button" tabIndex={0}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
            >
              <FileUp size={30} strokeWidth={1.6} />
              <strong>{busy ? "Lendo o arquivo..." : "Solte o arquivo .ofx aqui"}</strong>
              <span>ou clique para escolher. Funciona com extratos e faturas de cartão (OFX/QFX).</span>
              <input ref={input} type="file" accept=".ofx,.qfx,.OFX,.QFX,application/x-ofx,text/plain" hidden onChange={(e) => send(e.target.files?.[0])} />
            </div>
            <p className="ofx-note">Nada é gravado antes de você conferir e confirmar na próxima etapa.</p>
            {error && <p className="ofx-error">{error}</p>}
          </div>
        )}

        {step === "preview" && pv && (
          <>
            <div className="ofx-body">
              <div className="ofx-meta">
                <div><span>Banco</span><b>{pv.file.bank.org || "—"}</b></div>
                <div><span>Período</span><b>{pv.file.period.from ? `${dmy(pv.file.period.from)} a ${dmy(pv.file.period.to)}` : "—"}</b></div>
                <div><span>Lançamentos</span><b>{pv.summary.total}</b></div>
                <div><span>Saídas</span><b>{brl(pv.summary.expenses)}</b></div>
                <div><span>Entradas</span><b>{brl(pv.summary.income)}</b></div>
              </div>

              <div className="ofx-account">
                <label>Importar na conta
                  <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                    <option value="" disabled>Escolha a conta</option>
                    {pv.accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {TYPE_LABEL[a.type] || a.type}</option>)}
                    <option value="new">Criar nova conta...</option>
                  </select>
                </label>
                {accountId === "new" && <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome da nova conta" aria-label="Nome da nova conta" />}
                {pv.accountMatched && <span className="ofx-ok"><Check size={13} /> conta reconhecida pelo arquivo</span>}
              </div>

              {pv.summary.duplicates > 0 && <p className="ofx-warn"><AlertTriangle size={14} /> {pv.summary.duplicates} lançamento(s) já existem e foram desmarcados.</p>}

              <div className="ofx-bulk">
                <span>Categoria em massa (só sem categoria):</span>
                <select defaultValue="" onChange={(e) => { if (e.target.value) bulkCat("expense", e.target.value); e.target.value = ""; }} aria-label="Categoria para saídas">
                  <option value="">Saídas...</option>{expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select defaultValue="" onChange={(e) => { if (e.target.value) bulkCat("income", e.target.value); e.target.value = ""; }} aria-label="Categoria para entradas">
                  <option value="">Entradas...</option>{incomeCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="ofx-table" role="table">
                {rows.map((r) => (
                  <div key={r.idx} role="row" className={`ofx-row${r.selected ? "" : " off"}${!r.categoryId && r.selected ? " need" : ""}`}>
                    <input type="checkbox" checked={r.selected} onChange={(e) => upd(r.idx, { selected: e.target.checked })} aria-label="Importar este lançamento" />
                    <span className="ofx-date">{dmy(r.date)}</span>
                    <span className="ofx-desc">
                      {r.description}
                      {r.duplicate && <em>já existe</em>}
                      {r.payment && <em>pagamento da fatura</em>}
                    </span>
                    <span className={`ofx-amt ${r.type}`}>{r.type === "expense" ? "-" : "+"}{brl(r.amount)}</span>
                    <select value={r.categoryId || ""} onChange={(e) => upd(r.idx, { categoryId: e.target.value || null })} aria-label="Categoria">
                      <option value="">Categoria...</option>
                      {(r.type === "expense" ? expenseCats : incomeCats).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {error && <p className="ofx-error">{error}</p>}
            </div>
            <footer className="ofx-foot">
              <span>{picked.length} selecionado(s){missing ? ` · ${missing} sem categoria` : ""}</span>
              <button type="button" className="ofx-ghost" onClick={() => { setStep("pick"); setPv(null); }}>Voltar</button>
              <button type="button" className="ofx-primary" disabled={!canCommit} onClick={commit}>{busy ? "Importando..." : `Importar ${picked.length}`}</button>
            </footer>
          </>
        )}

        {step === "done" && result && (
          <div className="ofx-body ofx-doneBox">
            <span className="ofx-check"><Check size={28} /></span>
            <h3>{result.added} lançamento(s) importado(s)</h3>
            {result.skipped > 0 && <p>{result.skipped} já existiam e foram ignorados.</p>}
            <button type="button" className="ofx-primary" onClick={onClose}>Concluir</button>
          </div>
        )}
      </div>
    </div>
  );
}
