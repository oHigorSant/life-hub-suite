"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import QRCode from "qrcode";
import { X, Landmark, RefreshCw, Trash2, Smartphone, Plus, AlertTriangle, Check } from "lucide-react";
import "./ofx.css";
import "./bank.css";

// O widget do Pluggy só roda no navegador.
const PluggyConnect = dynamic(() => import("react-pluggy-connect").then((m) => m.PluggyConnect), { ssr: false });

const ago = (iso) => {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return min < 1 ? "agora" : min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dia(s)`;
};

async function post(payload) {
  const r = await fetch("/api/finance/pluggy", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha na operação.");
  return j;
}

/** Conexão com os bancos por Open Finance (Pluggy): widget, QR code para fazer a autorização no celular e sincronização. */
export default function BankConnect({ onClose, onChanged, autoConnect = false }) {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null); // "connect" | "sync" | id do item
  const [connect, setConnect] = useState(null); // { token, itemId }
  const [sandbox, setSandbox] = useState(false);
  const [qr, setQr] = useState(null);
  const [showQr, setShowQr] = useState(false);
  const [trial, setTrial] = useState(false); // o Pluggy recusou banco real: conta em modo de teste
  const [mpQr, setMpQr] = useState(null);
  const [itemInput, setItemInput] = useState("");

  const load = useCallback(async () => {
    try { const r = await fetch("/api/finance/pluggy", { cache: "no-store" }); setSt(await r.json()); } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startConnect = useCallback(async (itemId) => {
    setErr(null); setMsg(null); setBusy("connect");
    try { const j = await post({ op: "connectToken", itemId }); setConnect({ token: j.accessToken, itemId }); } catch (e) { setErr(e.message); }
    setBusy(null);
  }, []);
  useEffect(() => { if (autoConnect && st?.configured && !connect) startConnect(); }, [autoConnect, st?.configured]); // abre direto ao chegar pelo QR

  async function onSuccess(data) {
    const itemId = data?.item?.id;
    setConnect(null);
    if (!itemId) return;
    setBusy("sync"); setMsg("Banco conectado. Importando suas contas e lançamentos...");
    try {
      const r = await post({ op: "register", itemId });
      setMsg(`${r.bank || "Banco"} conectado: ${r.accounts} conta(s), ${r.added} lançamento(s) novos${r.linked ? `, ${r.linked} ligado(s) a lançamentos seus` : ""}.`);
      onChanged?.();
    } catch (e) { setErr(e.message); }
    setBusy(null); load();
    try { const u = new URL(window.location.href); if (u.searchParams.has("conectar")) { u.searchParams.delete("conectar"); window.history.replaceState({}, "", u); } } catch {}
  }

  async function sync(itemId) {
    setErr(null); setMsg(null); setBusy(itemId || "sync");
    try {
      const j = await post({ op: "sync", itemId, refresh: !!itemId });
      const rs = j.results || [j];
      const added = rs.reduce((s, r) => s + (r.added || 0), 0);
      const bad = rs.filter((r) => r.error);
      setMsg(`${added} lançamento(s) novo(s).${bad.length ? ` ${bad.length} banco(s) com problema: ${bad.map((b) => `${b.bank || "banco"} (${b.error})`).join("; ")}` : ""}`);
      onChanged?.();
    } catch (e) { setErr(e.message); }
    setBusy(null); load();
  }
  async function remove(i) {
    if (!confirm(`Desconectar ${i.name}? Os lançamentos já importados continuam no hub.`)) return;
    try { await post({ op: "remove", itemId: i.id }); onChanged?.(); load(); } catch (e) { setErr(e.message); }
  }
  async function setting(patch) { try { setSt(await post({ op: "settings", ...patch })); } catch (e) { setErr(e.message); } }

  async function toggleMpQr() {
    if (mpQr) return setMpQr(null);
    setMpQr(await QRCode.toDataURL("https://meu.pluggy.ai", { margin: 1, width: 240, color: { dark: "#1d1d1f", light: "#ffffff" } }));
  }
  async function addItemId() {
    const id = itemInput.trim();
    if (!/^[0-9a-f-]{20,}$/i.test(id)) return setErr("Item ID inválido (parece com 3f2c0a1e-....).");
    setItemInput(""); await onSuccess({ item: { id } });
  }
  function handleWidgetError(e) {
    const text = `${e?.code || ""} ${e?.message || ""}`;
    if (/TRIAL_CLIENT_ITEM_CREATE_NOT_ALLOWED|TRIAL/i.test(text)) { setTrial(true); setErr(null); }
    else setErr(`Falha na conexão: ${e?.message || "tente de novo"}`);
    setConnect(null);
  }

  async function toggleQr() {
    if (!showQr && !qr) {
      const url = `${window.location.origin}/financas?conectar=1`;
      setQr({ url, img: await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#1d1d1f", light: "#ffffff" } }) });
    }
    setShowQr((v) => !v);
  }

  return (
    <div className="ofx-back" onMouseDown={(e) => e.target === e.currentTarget && !connect && onClose()}>
      <div className="ofx-modal bk-modal" role="dialog" aria-modal="true" aria-label="Conectar bancos">
        <header className="ofx-head">
          <h2><Landmark size={18} style={{ verticalAlign: "-3px", marginRight: 8 }} />Bancos conectados (Open Finance)</h2>
          <button type="button" className="ofx-x" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="ofx-body">
          {!st && <p className="bk-hint">Carregando...</p>}
          {st && !st.configured && (
            <div className="bk-warn"><AlertTriangle size={16} /><div><b>Falta configurar o Pluggy no servidor.</b><br />Rode no PowerShell do seu PC: <code>powershell -File C:\vps-local\set-pluggy-keys.ps1</code> (ele pede o Client ID e o Client Secret do painel do Pluggy, com o texto oculto).</div></div>
          )}
          {err && <p className="ofx-error">{err}</p>}
          {msg && <p className="bk-ok"><Check size={14} /> {msg}</p>}

          {st?.configured && (
            <>
              <ul className="bk-list">
                {st.items.length === 0 && <li className="bk-empty">Nenhum banco conectado ainda. Toque em &ldquo;Conectar banco&rdquo; e escolha Nubank, C6, Caixa ou PicPay.</li>}
                {st.items.map((i) => (
                  <li key={i.id}>
                    {i.imageUrl ? <img src={i.imageUrl} alt="" referrerPolicy="no-referrer" /> : <span className="bk-ico"><Landmark size={16} /></span>}
                    <div className="bk-main">
                      <strong>{i.name}</strong>
                      <span>{i.accounts} conta(s) · sincronizado {ago(i.lastSyncAt)}{i.lastResult ? ` · último: ${i.lastResult.added} novo(s)` : ""}</span>
                      {i.lastError && <em className="bk-bad">{i.lastError}</em>}
                      {["LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT", "WAITING_USER_ACTION"].includes(i.status) && <em className="bk-bad">Precisa reconectar ({i.status})</em>}
                    </div>
                    <div className="bk-act">
                      {["LOGIN_ERROR", "OUTDATED", "WAITING_USER_INPUT", "WAITING_USER_ACTION"].includes(i.status)
                        ? <button type="button" onClick={() => startConnect(i.id)} disabled={!!busy}>Reconectar</button>
                        : <button type="button" onClick={() => sync(i.id)} disabled={!!busy} aria-label="Sincronizar"><RefreshCw size={14} className={busy === i.id ? "spin" : ""} /> Sincronizar</button>}
                      <button type="button" className="ghost" onClick={() => remove(i)} aria-label="Desconectar"><Trash2 size={14} /></button>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="bk-actions">
                <button type="button" className="ofx-primary" onClick={() => startConnect()} disabled={!!busy}><Plus size={15} style={{ verticalAlign: "-3px" }} /> Conectar banco</button>
                <button type="button" className="ofx-ghost" onClick={toggleQr}><Smartphone size={15} style={{ verticalAlign: "-3px" }} /> {showQr ? "Esconder QR code" : "Conectar pelo celular"}</button>
                {st.items.length > 0 && <button type="button" className="ofx-ghost" onClick={() => sync()} disabled={!!busy}><RefreshCw size={14} className={busy === "sync" ? "spin" : ""} style={{ verticalAlign: "-2px" }} /> Sincronizar tudo</button>}
              </div>

              {showQr && qr && (
                <div className="bk-qr">
                  <img src={qr.img} alt="QR code para conectar pelo celular" width="168" height="168" />
                  <div>
                    <b>Escaneie com a câmera do celular</b>
                    <p>Abre o hub no celular (faça login se pedir) já na tela de conexão. O banco abre o próprio app para você autorizar o compartilhamento, que é mais fácil no celular do que no computador.</p>
                    <small>{qr.url}</small>
                  </div>
                </div>
              )}

              {(trial || st.items.length === 0) && (
                <div className={`bk-guide${trial ? " alert" : ""}`}>
                  <h3>{trial ? "O Pluggy recusou o banco: sua conta está em teste" : "Como conectar seus bancos de graça (MeuPluggy)"}</h3>
                  {trial && <p>Contas novas do Pluggy ficam 15 dias em modo de teste e só aceitam bancos de teste. Para ligar os bancos <b>reais</b> sem pagar, use o <b>MeuPluggy</b>, o serviço gratuito do Pluggy para pessoas físicas:</p>}
                  <ol>
                    <li>Abra <a href="https://meu.pluggy.ai" target="_blank" rel="noopener noreferrer">meu.pluggy.ai</a> (de preferência no celular: <button type="button" className="bk-linkbtn" onClick={toggleMpQr}>{mpQr ? "esconder QR" : "mostrar QR"}</button>), crie sua conta e conecte cada banco (Nubank, C6, Caixa, PicPay) pelo Open Finance.</li>
                    <li>No painel do Pluggy (<a href="https://dashboard.pluggy.ai" target="_blank" rel="noopener noreferrer">dashboard.pluggy.ai</a>), abra o seu aplicativo, vá em <b>Conectores</b> e ative o <b>MeuPluggy</b>.</li>
                    <li>Volte aqui, toque em <b>Conectar banco</b>, escolha <b>MeuPluggy</b> e autorize. Repita uma vez por banco. Daí em diante tudo sincroniza sozinho.</li>
                  </ol>
                  {mpQr && <div className="bk-qr"><img src={mpQr} alt="QR code do MeuPluggy" width="140" height="140" /><div><b>MeuPluggy no celular</b><p>Escaneie para abrir o meu.pluggy.ai e conectar seus bancos pelos apps deles.</p></div></div>}
                  <div className="bk-itemid">
                    <label>Já autorizou pelo painel do Pluggy? Cole aqui o <b>Item ID</b>:
                      <span><input value={itemInput} onChange={(e) => setItemInput(e.target.value)} placeholder="3f2c0a1e-...." aria-label="Item ID" /><button type="button" className="ofx-ghost" onClick={addItemId} disabled={!!busy || !itemInput.trim()}>Adicionar</button></span>
                    </label>
                  </div>
                </div>
              )}

              <div className="bk-settings">
                <label><input type="checkbox" checked={st.settings.autoSync} onChange={(e) => setting({ autoSync: e.target.checked })} /> Sincronizar sozinho a cada poucas horas (e quando o banco avisar)</label>
                <label><input type="checkbox" checked={st.settings.importBills} onChange={(e) => setting({ importBills: e.target.checked })} /> Faturas dos cartões como contas a pagar <small>(fechadas e a em aberto; contas suas que o extrato provar pagas são baixadas sozinhas)</small></label>
                <label><input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} /> Mostrar bancos de teste (sandbox) ao conectar</label>
              </div>
              <p className="bk-hint">Seus cartões já cadastrados (Nubank, C6, Caixa, PicPay) são ligados aos dados do banco, sem duplicar. Pagamentos de fatura e transferências entre contas são marcados e não entram nos gastos. A autorização do Open Finance vale por até 12 meses; o banco pede para renovar.</p>
            </>
          )}
        </div>
      </div>

      {connect && (
        <PluggyConnect
          connectToken={connect.token}
          updateItem={connect.itemId || undefined}
          includeSandbox={sandbox}
          onSuccess={onSuccess}
          onError={handleWidgetError}
          onClose={() => setConnect(null)}
        />
      )}
    </div>
  );
}
