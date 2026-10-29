"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, FlaskConical, RotateCcw, X, Plus, ShieldCheck } from "lucide-react";
import { useLive } from "@/components/live/liveClient.js";
import { Gauge, Donut, StackedBars, AreaChart, HBars, COLORS } from "./charts.jsx";
import "./motores.css";

const NAME = { gemini: "Gemini", claude: "Claude", openrouter: "OpenRouter" };
const SUB = { gemini: "API gratuita do Google", claude: "Claude Code, pela assinatura", openrouter: "Modelo barato, pago por token" };
const fmt = (n) => (n || 0).toLocaleString("pt-BR");
const dec1 = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const short = (n) => (n >= 1e6 ? `${dec1(n / 1e6)} mi` : n >= 1e3 ? `${dec1(n / 1e3)} mil` : String(Math.round(n || 0)));
const usd = (n, d = 2) => `US$ ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const when = (ms) => {
  const min = Math.max(1, Math.round((ms - Date.now()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ${min % 60} min` : `${Math.round(h / 24)} dia(s)`;
};
const dayLabel = (d) => d.split("-").reverse().slice(0, 2).join("/");

async function post(payload) {
  const r = await fetch("/api/agente/engines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Falha ao salvar.");
  return j;
}

function Chip({ e }) {
  if (!e.enabled) return <span className="mt-chip off">desligado</span>;
  if (e.reason === "sem chave") return <span className="mt-chip off">sem chave</span>;
  if (!e.available) return <span className="mt-chip warn" title={e.reason || ""}>em espera{e.until ? ` · ${when(e.until)}` : ""}</span>;
  return <span className="mt-chip ok">disponível</span>;
}

export default function MotoresClient() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("geral");
  const [tests, setTests] = useState({});
  const [custom, setCustom] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/agente/engines?full=1", { cache: "no-store" });
      if (!r.ok) throw new Error("Falha ao carregar.");
      setSt(await r.json()); setErr(null);
    } catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);
  useLive(["engines"], load);

  const save = async (config) => { try { await post({ config }); await load(); } catch (e) { setErr(e.message); } };
  async function test(engine) {
    setTests((t) => ({ ...t, [engine]: { busy: true } }));
    try { const r = await post({ op: "test", engine }); setTests((t) => ({ ...t, [engine]: r })); } catch (e) { setTests((t) => ({ ...t, [engine]: { ok: false, error: e.message } })); }
    load();
  }

  const derived = useMemo(() => {
    if (!st) return null;
    const week = st.week.slice(-7);
    const days = week.map((d) => ({ label: dayLabel(d.day), parts: [{ key: "Gemini", value: d.gemini, color: COLORS.gemini }, { key: "Claude", value: d.claude, color: COLORS.claude }, { key: "OpenRouter", value: d.openrouter, color: COLORS.openrouter }] }));
    const cost = week.map((d) => ({ label: dayLabel(d.day), value: d.cost }));
    const weekTotals = week.reduce((a, d) => ({ gemini: a.gemini + d.gemini, claude: a.claude + d.claude, openrouter: a.openrouter + d.openrouter, cost: a.cost + d.cost }), { gemini: 0, claude: 0, openrouter: 0, cost: 0 });
    return { days, cost, weekTotals, hasWeek: week.some((d) => d.gemini + d.claude + d.openrouter > 0) };
  }, [st]);

  if (!st) return <div className="mt"><div className="mt-inner">{err ? <p className="mt-err">{err}</p> : <div className="mt-skel" aria-busy="true" />}</div></div>;
  const cfg = st.config;
  const eng = (id) => st.engines.find((e) => e.id === id);
  const or = st.openrouter;
  const move = (i, d) => { const c = [...cfg.chain]; const j = i + d; if (j < 0 || j >= c.length) return; [c[i], c[j]] = [c[j], c[i]]; save({ chain: c }); };
  const modeText = cfg.mode === "auto" ? `Automático · ${cfg.chain.map((i) => NAME[i]).join(" › ")}` : `Fixo em ${NAME[cfg.manual.engine]}${cfg.manual.strict ? " (rígido)" : ""}`;
  const credit = or.account?.credits;
  const creditPct = credit && credit.total > 0 ? (credit.remaining / credit.total) * 100 : null;
  const orKeys = (or.account?.keys || []).filter((k) => Number(k.month) > 0 || Number(k.day) > 0).sort((a, b) => (b.month || 0) - (a.month || 0));
  const geminiModels = st.catalog?.gemini || [];
  const setGeminiModels = (list) => save({ models: { gemini: list.length ? list : cfg.models.gemini } });
  const claudeWins = st.claude.windows.filter((w) => w.type === "five_hour" || w.type === "seven_day" || w.percent > 0);
  const todayTotal = st.today.gemini.requests + st.today.claude.requests + st.today.openrouter.requests;

  return (
    <div className="mt">
      <div className="mt-inner">
        <header className="mt-head">
          <div><p className="mt-eyebrow">Inteligência artificial</p><h1>Motores</h1><p className="mt-lede">Quem responde ao assistente e quanto cada IA está usando.</p></div>
          <div className="mt-pill-mode" title="Como o hub escolhe quem responde">{modeText}</div>
        </header>
        {err && <p className="mt-err">{err}</p>}

        <nav className="mt-tabs" role="tablist" aria-label="Seções">
          {[["geral", "Visão geral"], ["modelos", "Modelos"], ["avancado", "Avançado"]].map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>

        {tab === "geral" && (
          <>
            {/* ---- roteamento ---- */}
            <section className="mt-card">
              <div className="mt-card-head">
                <h2>Quem responde</h2>
                <div className="mt-seg" role="tablist">
                  <button type="button" className={cfg.mode === "auto" ? "on" : ""} onClick={() => save({ mode: "auto" })}>Automático</button>
                  <button type="button" className={cfg.mode === "manual" ? "on" : ""} onClick={() => save({ mode: "manual" })}>Escolher um</button>
                </div>
              </div>
              {cfg.mode === "manual" && (
                <div className="mt-row">
                  <label>Motor
                    <select value={cfg.manual.engine} onChange={(e) => save({ manual: { engine: e.target.value } })}>{Object.keys(NAME).map((id) => <option key={id} value={id}>{NAME[id]}</option>)}</select>
                  </label>
                  <label className="mt-check"><input type="checkbox" checked={cfg.manual.strict} onChange={(e) => save({ manual: { strict: e.target.checked } })} />Rígido: não trocar de motor se falhar</label>
                </div>
              )}
              <ol className="mt-flow">
                {cfg.chain.map((id, i) => {
                  const e = eng(id);
                  const manualPick = cfg.mode === "manual" && cfg.manual.engine === id;
                  return (
                    <li key={id} className={`${cfg.enabled[id] ? "" : "off"}${manualPick ? " pick" : ""}`} style={{ "--c": COLORS[id] }}>
                      <div className="mt-flow-top"><span className="mt-badge">{i + 1}</span><Chip e={e} /></div>
                      <strong>{NAME[id]}</strong>
                      <span className="mt-flow-sub">{SUB[id]}</span>
                      <span className="mt-flow-model">{id === "gemini" ? cfg.models.gemini[0] : id === "claude" ? (cfg.models.claude || "modelo padrão") : cfg.models.openrouter}</span>
                      <div className="mt-flow-foot">
                        <span>{fmt(st.today[id].requests)} hoje</span>
                        <span className="mt-flow-actions">
                          <button type="button" aria-label="Mover para antes" disabled={i === 0} onClick={() => move(i, -1)}><ArrowLeft size={14} /></button>
                          <button type="button" aria-label="Mover para depois" disabled={i === cfg.chain.length - 1} onClick={() => move(i, 1)}><ArrowRight size={14} /></button>
                          <label className="mt-switch" title="Ligar/desligar"><input type="checkbox" checked={cfg.enabled[id]} onChange={(ev) => save({ enabled: { [id]: ev.target.checked } })} /><i /></label>
                        </span>
                      </div>
                      {i < cfg.chain.length - 1 && <span className="mt-flow-arrow" aria-hidden="true">›</span>}
                    </li>
                  );
                })}
              </ol>
              <p className="mt-hint">{cfg.mode === "auto" ? "Se um motor falhar ou bater o limite, passa para o próximo sozinho. O chat nunca fica sem resposta." : "Só o motor escolhido responde" + (cfg.manual.strict ? "." : ", e os outros entram se ele falhar.")}</p>
            </section>

            {/* ---- cartões por IA ---- */}
            <div className="mt-grid3">
              <section className="mt-card" style={{ "--c": COLORS.claude }}>
                <div className="mt-card-head"><h2><i className="mt-dot" />Claude</h2><Chip e={eng("claude")} /></div>
                {claudeWins.length === 0 ? <p className="mt-hint">Sem dados ainda. Aparecem depois da próxima conversa com o Claude.</p> : (
                  <div className="mt-gauges">
                    {claudeWins.map((w) => <Gauge key={w.type} value={w.percent} label={w.label.replace("Sessão de 5 horas", "Sessão 5 h")} sub={w.expired ? "renovada" : w.resetsAt ? `renova em ${when(w.resetsAt)}` : ""} color={COLORS.claude} size={118} />)}
                  </div>
                )}
                <p className="mt-foot">Modelo da CLI: <b>{cfg.models.claude || "padrão"}</b></p>
              </section>

              <section className="mt-card" style={{ "--c": COLORS.gemini }}>
                <div className="mt-card-head"><h2><i className="mt-dot" />Gemini</h2><Chip e={eng("gemini")} /></div>
                <div className="mt-stats">
                  <div><b>{fmt(st.today.gemini.requests)}</b><span>pedidos hoje</span></div>
                  <div><b>{short(st.today.gemini.inTok)}</b><span>tokens de entrada</span></div>
                  <div><b>{short(st.today.gemini.outTok)}</b><span>tokens de saída</span></div>
                </div>
                <ul className="mt-keys">
                  {st.gemini.keys.map((k) => {
                    const req = k.models.reduce((a, m) => a + m.requests, 0);
                    const hit = k.models.filter((m) => m.cooldown);
                    const soon = hit.length ? Math.min(...hit.map((m) => m.cooldown.until)) : 0;
                    return (
                      <li key={k.id}>
                        <span>Chave …{k.tail}</span><em>{fmt(req)} pedidos</em>
                        {hit.length === 0 ? <span className="mt-chip ok">livre</span> : <span className="mt-chip warn" title={hit[0].cooldown.reason}>{hit.length === k.models.length ? "em espera" : "parcial"} · {when(soon)}</span>}
                      </li>
                    );
                  })}
                  {st.gemini.keys.length === 0 && <li><span>Nenhuma chave configurada.</span></li>}
                </ul>
                <p className="mt-foot">A cota diária do Google renova às 4h (horário de Brasília).</p>
              </section>

              <section className="mt-card" style={{ "--c": COLORS.openrouter }}>
                <div className="mt-card-head"><h2><i className="mt-dot" />OpenRouter</h2><Chip e={eng("openrouter")} /></div>
                {credit ? (
                  <div className="mt-orbal">
                    <Gauge value={creditPct ?? 0} label="Saldo" sub={`${usd(credit.used)} usados`} color={COLORS.openrouter} size={118} display={usd(credit.remaining, 2).replace("US$ ", "$")} />
                    <div className="mt-stats col">
                      <div><b>{usd(st.today.openrouter.cost, 4)}</b><span>hoje neste hub</span></div>
                      <div><b>{fmt(st.today.openrouter.requests)}</b><span>pedidos hoje</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-stats">
                    <div><b>{usd(st.today.openrouter.cost, 4)}</b><span>hoje neste hub</span></div>
                    <div><b>{fmt(st.today.openrouter.requests)}</b><span>pedidos hoje</span></div>
                  </div>
                )}
                {or.hasKey && !or.hasManagement && <p className="mt-hint">Com uma chave de gerenciamento o painel mostra o saldo e todas as chaves da conta.</p>}
                <p className="mt-foot">Modelo: <b>{cfg.models.openrouter}</b></p>
              </section>
            </div>

            {/* ---- gráficos ---- */}
            <div className="mt-grid2">
              <section className="mt-card">
                <div className="mt-card-head"><h2>Pedidos nos últimos 7 dias</h2></div>
                {derived.hasWeek ? <StackedBars days={derived.days} legend={[{ label: "Gemini", color: COLORS.gemini }, { label: "Claude", color: COLORS.claude }, { label: "OpenRouter", color: COLORS.openrouter }]} /> : <p className="mt-hint">O gráfico aparece conforme o uso for sendo registrado.</p>}
              </section>
              <section className="mt-card">
                <div className="mt-card-head"><h2>Participação hoje</h2></div>
                {todayTotal > 0 ? (
                  <Donut size={150} slices={[{ label: "Gemini", value: st.today.gemini.requests, color: COLORS.gemini }, { label: "Claude", value: st.today.claude.requests, color: COLORS.claude }, { label: "OpenRouter", value: st.today.openrouter.requests, color: COLORS.openrouter }]} />
                ) : <p className="mt-hint">Nenhum pedido registrado hoje ainda.</p>}
              </section>
            </div>

            <div className="mt-grid2">
              <section className="mt-card">
                <div className="mt-card-head"><h2>Gasto no OpenRouter</h2><span className="mt-total">{usd(derived.weekTotals.cost, 4)} em 7 dias</span></div>
                {derived.cost.length > 1 ? <AreaChart points={derived.cost} format={(v) => usd(v, 4)} /> : <p className="mt-hint">Precisa de pelo menos 2 dias de uso para desenhar a curva.</p>}
              </section>
              <section className="mt-card">
                <div className="mt-card-head"><h2>Gasto por chave</h2><span className="mt-total">30 dias</span></div>
                {orKeys.length > 0 ? <HBars rows={orKeys.slice(0, 6).map((k) => ({ label: k.name, value: Number(k.month) || 0, sub: `hoje ${usd(k.day, 4)} · total ${usd(k.usage)}` }))} format={(v) => usd(v)} /> : <p className="mt-hint">{or.hasManagement ? "Nenhuma chave com gasto nos últimos 30 dias." : "Disponível com a chave de gerenciamento do OpenRouter."}</p>}
              </section>
            </div>
          </>
        )}

        {tab === "modelos" && (
          <section className="mt-stack">
            {cfg.chain.map((id) => (
              <article key={id} className="mt-card" style={{ "--c": COLORS[id] }}>
                <div className="mt-card-head"><h2><i className="mt-dot" />{NAME[id]}</h2><Chip e={eng(id)} /></div>
                {id === "gemini" && (
                  <>
                    <span className="mt-lbl">Modelos, na ordem de tentativa (cada um tem cota própria)</span>
                    <div className="mt-pills">
                      {cfg.models.gemini.map((m, k) => (
                        <span key={m} className="mt-pill">
                          {k > 0 && <button type="button" aria-label="Antes" onClick={() => { const l = [...cfg.models.gemini]; [l[k - 1], l[k]] = [l[k], l[k - 1]]; setGeminiModels(l); }}><ArrowUp size={11} /></button>}
                          {m}
                          <button type="button" aria-label="Remover" onClick={() => setGeminiModels(cfg.models.gemini.filter((x) => x !== m))}><X size={11} /></button>
                        </span>
                      ))}
                      <select value="" onChange={(e) => e.target.value && setGeminiModels([...cfg.models.gemini, e.target.value])} aria-label="Adicionar modelo">
                        <option value="">+ adicionar modelo</option>
                        {geminiModels.filter((m) => !cfg.models.gemini.includes(m)).map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </>
                )}
                {id === "claude" && (
                  <label className="mt-field">Modelo da CLI
                    <select value={cfg.models.claude} onChange={(e) => save({ models: { claude: e.target.value } })}>
                      {(st.catalog?.claude || []).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      {cfg.models.claude && !(st.catalog?.claude || []).some(([v]) => v === cfg.models.claude) && <option value={cfg.models.claude}>{cfg.models.claude}</option>}
                    </select>
                  </label>
                )}
                {id === "openrouter" && (
                  <>
                    <label className="mt-field">Modelo
                      <select value={cfg.models.openrouter} onChange={(e) => save({ models: { openrouter: e.target.value } })}>
                        {!(st.catalog?.openrouter || []).some((m) => m.id === cfg.models.openrouter) && <option value={cfg.models.openrouter}>{cfg.models.openrouter}</option>}
                        {(st.catalog?.openrouter || []).map((m) => <option key={m.id} value={m.id}>{m.id} — US$ {m.in.toFixed(3)} entrada / {m.out.toFixed(3)} saída por milhão</option>)}
                      </select>
                    </label>
                    <div className="mt-custom">
                      <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ou digite outro id (ex.: qwen/qwen3.7-flash)" aria-label="Outro modelo" />
                      <button type="button" disabled={!/^[\w.\-:~\/]+$/.test(custom)} onClick={() => { save({ models: { openrouter: custom } }); setCustom(""); }}><Plus size={14} /> Usar</button>
                    </div>
                    <p className="mt-hint">Nos testes, o qwen/qwen3.7-flash foi o mais barato que acertou tudo; o deepseek/deepseek-v4.1-flash foi o mais rápido.</p>
                  </>
                )}
                <div className="mt-test">
                  <button type="button" onClick={() => test(id)} disabled={tests[id]?.busy}><FlaskConical size={14} /> {tests[id]?.busy ? "Testando..." : "Testar"}</button>
                  {!eng(id).available && eng(id).reason !== "sem chave" && <button type="button" className="ghost" onClick={async () => { await post({ op: "clear" }); load(); }}><RotateCcw size={14} /> Liberar espera</button>}
                  {tests[id] && !tests[id].busy && (tests[id].ok
                    ? <span className="mt-res ok">funcionou em {(tests[id].ms / 1000).toFixed(1)} s{tests[id].model ? ` (${tests[id].model})` : ""}</span>
                    : <span className="mt-res bad">{tests[id].error}</span>)}
                </div>
              </article>
            ))}
          </section>
        )}

        {tab === "avancado" && (
          <section className="mt-stack">
            <article className="mt-card">
              <div className="mt-card-head"><h2><ShieldCheck size={17} /> Privacidade do Gemini grátis</h2></div>
              <label className="mt-check mt-privacy"><input type="checkbox" checked={cfg.privacy.geminiPersonal} onChange={(e) => save({ privacy: { geminiPersonal: e.target.checked } })} />
                <span><b>Permitir dados pessoais no Gemini grátis.</b> Desligado (recomendado): no modo automático ele não recebe pedidos sobre finanças, tarefas, notas ou agenda, porque na camada gratuita o Google pode usar o conteúdo para treinar. Código (/dev) e perguntas gerais continuam com ele.</span></label>
            </article>
            <article className="mt-card">
              <div className="mt-card-head"><h2>Pedidos de código (/dev)</h2></div>
              <div className="mt-row">
                <label>Ordem no /dev
                  <select value={cfg.devChain.length ? cfg.devChain.join(",") : ""} onChange={(e) => save({ devChain: e.target.value ? e.target.value.split(",") : [] })}>
                    <option value="">Mesma ordem do chat</option>
                    <option value="claude,openrouter,gemini">Claude, OpenRouter, Gemini (mais seguro para código)</option>
                    <option value="claude,gemini,openrouter">Claude, Gemini, OpenRouter</option>
                    <option value="openrouter,claude,gemini">OpenRouter, Claude, Gemini</option>
                    <option value="gemini,openrouter,claude">Gemini, OpenRouter, Claude</option>
                  </select>
                </label>
                <label>Passos máximos (chat)
                  <input type="number" min="3" max="80" defaultValue={cfg.limits.maxSteps.dados} onBlur={(e) => save({ limits: { maxSteps: { dados: Number(e.target.value) } } })} />
                </label>
                <label>Passos máximos (/dev)
                  <input type="number" min="3" max="120" defaultValue={cfg.limits.maxSteps.dev} onBlur={(e) => save({ limits: { maxSteps: { dev: Number(e.target.value) } } })} />
                </label>
              </div>
              <p className="mt-hint">Antes de cada pedido de código, o hub guarda uma cópia do projeto (as últimas 8) para você poder voltar atrás.</p>
            </article>
            <article className="mt-card">
              <div className="mt-card-head"><h2>Detalhe do Gemini por chave e modelo</h2></div>
              {st.gemini.keys.length === 0 ? <p className="mt-hint">Nenhuma chave configurada.</p> : (
                <table className="mt-table"><thead><tr><th>Chave</th><th>Modelo</th><th>Pedidos</th><th>Tokens (entrada / saída)</th><th>Estado</th></tr></thead>
                  <tbody>{st.gemini.keys.flatMap((k) => k.models.map((m, i) => (
                    <tr key={k.id + m.model}>
                      <td>{i === 0 ? `…${k.tail}` : ""}</td><td>{m.model}</td><td>{fmt(m.requests)}{m.errors ? ` (${m.errors} erros)` : ""}</td><td>{fmt(m.inTok)} / {fmt(m.outTok)}</td>
                      <td>{m.cooldown ? <span className="mt-chip warn" title={m.cooldown.reason}>espera · {when(m.cooldown.until)}</span> : <span className="mt-chip ok">livre</span>}</td>
                    </tr>)))}</tbody></table>
              )}
              <p className="mt-hint">O Google não informa a cota restante da camada gratuita; o hub conta o uso e mostra quando um limite é atingido e quando volta.</p>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}
