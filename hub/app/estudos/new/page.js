"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar, api } from "@/components/atlas/ui.js";
import { ArrowRight, ArrowLeft, Upload, X, Sparkles } from "@/components/atlas/icons.js";

const STARTS = ["Do zero", "Conheço o básico", "Intermediário", "Avançado"];
const TARGETS = ["Base sólida", "Nível profissional", "Domínio completo", "Ápice (referência na área)"];
const HOURS = [2, 5, 10, 20];
const IDEAS = ["Estatística para ciência de dados", "Anatomia humana", "Contabilidade de custos", "Piano jazz", "Direito constitucional", "Machine learning do zero"];

const GOAL_TEMPLATE = `Atuação: (onde e como vou usar isso no trabalho)
Entregas: (que problemas reais quero resolver com isso)
O que já domino: (base, ferramentas, experiência)
O que falta e me trava: (lacunas, termos e documentos que não entendo)
Ápice: (o que eu seria capaz de fazer, explicar e decidir que hoje um especialista faz)
Obras e nomes que quero como base: (livros, normas, autores, casos que conheço)`;

function fmt(n) {
  return n > 1e6 ? (n / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB";
}

export default function NewSubject() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ title: "", goal: "", start: STARTS[0], target: TARGETS[2], hours: 5, deadline: "", text: "", url: "", prompt: "" });
  const [files, setFiles] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = useRef();
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const addFiles = (list) => setFiles((cur) => [...cur, ...Array.from(list)]);

  async function create() {
    setBusy(true);
    setErr("");
    try {
      const { id } = await api("/api/estudos/subjects", { body: { title: f.title, goal: f.goal, start_level: f.start, target_level: f.target, hours_per_week: f.hours, deadline: f.deadline || null } });
      const form = new FormData();
      files.forEach((x) => form.append("files", x));
      if (f.text.trim()) form.append("text", f.text);
      if (f.url.trim()) form.append("url", f.url.trim());
      form.append("prompt", f.prompt);
      await api(`/api/estudos/subjects/${id}/build`, { form });
      router.push(`/estudos/s/${id}`);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <Topbar crumbs={[{ label: "Nova trilha" }]} />
      <main className="page" style={{ maxWidth: 760 }}>
        <div className="steps">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? "on" : ""} />)}</div>

        {step === 0 && (
          <div key="0" style={{ animation: "fadeUp .4s var(--ease) both" }}>
            <h1>O que você quer <span className="grad-text">dominar</span>?</h1>
            <p className="muted" style={{ fontSize: 16, margin: "10px 0 28px" }}>Uma área inteira, não uma prova: do iniciante ao ápice.</p>
            <div className="field">
              <label className="label">Área do conhecimento</label>
              <input className="input" autoFocus placeholder="Ex.: Estatística para ciência de dados" value={f.title} onChange={(e) => set("title", e.target.value)} />
              <div className="seg" style={{ marginTop: 12 }}>{IDEAS.map((i) => <button key={i} onClick={() => set("title", i)}>{i}</button>)}</div>
            </div>
            <div className="field">
              <label className="label">Seu objetivo (é o que mais melhora a trilha)</label>
              <textarea className="textarea" style={{ minHeight: 150 }} placeholder="Onde você vai atuar, que decisões e entregas dependem disso e o que significa dominar. Diga o que você já sabe e o que quer ser capaz de fazer no fim." value={f.goal} onChange={(e) => set("goal", e.target.value)} />
              <div className="row" style={{ marginTop: 10, gap: 8, flexWrap: "wrap" }}>
                <button className="btn sm" type="button" onClick={() => set("goal", f.goal.trim() || GOAL_TEMPLATE)}>Usar roteiro do briefing</button>
                <span className="hint" style={{ margin: 0 }}>Um bom briefing responde: atuação, entregas, o que já domina, o que falta, o que chamaria de ápice.</span>
              </div>
            </div>
            <button className="btn primary lg" disabled={!f.title.trim()} onClick={() => setStep(1)}>Continuar <ArrowRight size={18} /></button>
          </div>
        )}

        {step === 1 && (
          <div key="1" style={{ animation: "fadeUp .4s var(--ease) both" }}>
            <h1>Ponto de partida e ritmo</h1>
            <p className="muted" style={{ fontSize: 16, margin: "10px 0 28px" }}>Calibra a profundidade da árvore e a carga de cada dia.</p>
            <div className="field"><label className="label">Onde você está hoje</label><div className="seg">{STARTS.map((s) => <button key={s} className={f.start === s ? "on" : ""} onClick={() => set("start", s)}>{s}</button>)}</div></div>
            <div className="field"><label className="label">Aonde quer chegar</label><div className="seg">{TARGETS.map((s) => <button key={s} className={f.target === s ? "on" : ""} onClick={() => set("target", s)}>{s}</button>)}</div></div>
            <div className="field"><label className="label">Horas por semana</label><div className="seg">{HOURS.map((h) => <button key={h} className={f.hours === h ? "on" : ""} onClick={() => set("hours", h)}>{h} h</button>)}</div></div>
            <div className="field"><label className="label">Data-alvo (opcional)</label><input className="input" type="date" style={{ maxWidth: 220 }} value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /><div className="hint">Sem data, o Atlas não aperta o cronograma — só ordena o caminho.</div></div>
            <div className="row"><button className="btn" onClick={() => setStep(0)}><ArrowLeft size={16} /> Voltar</button><button className="btn primary lg" onClick={() => setStep(2)}>Continuar <ArrowRight size={18} /></button></div>
          </div>
        )}

        {step === 2 && (
          <div key="2" style={{ animation: "fadeUp .4s var(--ease) both" }}>
            <h1>Traga seu material</h1>
            <p className="muted" style={{ fontSize: 16, margin: "10px 0 24px" }}>PDF (até livros de 1000 páginas), texto, imagem, áudio, vídeo ou link. O Atlas captura a metodologia, os critérios e as referências — e monta o caminho. Sem material? Ele cria a trilha do zero.</p>
            <div className={"drop" + (over ? " over" : "")} onClick={() => input.current.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
              <div className="empty-ico"><Upload size={24} /></div>
              <div style={{ fontWeight: 600, marginTop: 6 }}>Arraste arquivos ou clique para escolher</div>
              <div className="dim" style={{ fontSize: 13 }}>pdf · txt/md · png/jpg · mp3/wav/m4a · mp4/mov/mkv</div>
              <input ref={input} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <div className="stack" style={{ marginTop: 14 }}>
                {files.map((x, i) => (
                  <div key={i} className="card row between" style={{ padding: "10px 14px" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name} <span className="dim">· {fmt(x.size)}</span></span>
                    <button className="btn ghost sm" onClick={() => setFiles(files.filter((_, k) => k !== i))} aria-label="Remover arquivo"><X size={16} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="field" style={{ marginTop: 22 }}><label className="label">Link (artigo, página, documentação)</label><input className="input" placeholder="https://…" value={f.url} onChange={(e) => set("url", e.target.value)} /></div>
            <div className="field"><label className="label">Ou cole um texto</label><textarea className="textarea" value={f.text} onChange={(e) => set("text", e.target.value)} /></div>
            <div className="card" style={{ marginBottom: 18, padding: "14px 16px" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Como obter a trilha mais rigorosa</div>
              <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                <li>Anexe as obras e normas canônicas da área (livros, leis, manuais oficiais): a trilha segue a estrutura delas.</li>
                <li>Se o material for do seu trabalho (sistemas, documentos internos), a trilha liga cada sistema ao conhecimento da área que o explica.</li>
                <li>Quanto mais concreto o objetivo, mais específicos os nós; um objetivo vago gera uma trilha genérica.</li>
                <li>Depois de criada, use "Expandir trilha" para pedir o que faltou, nomeando o assunto exato e os nomes que você quer como base.</li>
              </ul>
            </div>
            <div className="field"><label className="label">Algo a mais para a trilha? (opcional)</label><textarea className="textarea" style={{ minHeight: 90 }} placeholder="Ex.: cubra contencioso e casos reais; quero a estrutura do Arens para auditoria; já domino álgebra linear" value={f.prompt} onChange={(e) => set("prompt", e.target.value)} /></div>
            {err && <p style={{ color: "var(--red)" }}>{err}</p>}
            <div className="row"><button className="btn" onClick={() => setStep(1)} disabled={busy}><ArrowLeft size={16} /> Voltar</button><button className="btn primary lg" onClick={create} disabled={busy}>{busy ? <><span className="spinner" /> Enviando…</> : <><Sparkles size={18} /> Criar minha trilha</>}</button></div>
          </div>
        )}
      </main>
    </div>
  );
}
