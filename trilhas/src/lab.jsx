import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons.jsx';
import { Mascot } from './art.jsx';
import { ResultTable, Code } from './ui.jsx';
import { Editor } from './steps.jsx';
import { labOpen, labExec, labSchema } from './sqlEngine.js';
import { useMentor } from './mentor.jsx';

// Laboratório SQL: banco livre (o mesmo da trilha), sem exercício e sem nota. As alterações (INSERT/UPDATE/CREATE…)
// persistem enquanto a tela estiver aberta; "Restaurar banco" volta ao original. Consultas podem ir para as Notas.
const EXAMPLES = [
  'SELECT * FROM clientes LIMIT 5;',
  'SELECT estado, COUNT(*) AS total\nFROM clientes\nGROUP BY estado\nORDER BY total DESC;',
  'SELECT p.nome, c.nome AS categoria, p.preco\nFROM produtos p\nJOIN categorias c ON c.id = p.categoria_id\nORDER BY p.preco DESC\nLIMIT 5;',
];

const store = (k, v) => { try { v === undefined ? JSON.parse(localStorage.getItem(k)) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };

export default function Lab({ trackId, loadTrackFull, go }) {
  const mentor = useMentor();
  const [track, setTrack] = useState(null);
  const [sql, setSql] = useState(() => read(`trilhas:lab:sql:${trackId}`, EXAMPLES[0]));
  const [out, setOut] = useState(null);
  const [schema, setSchema] = useState([]);
  const [history, setHistory] = useState(() => read(`trilhas:lab:hist:${trackId}`, []));
    const [toast, setToast] = useState('');
  const dbRef = useRef(null);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  useEffect(() => {
    let off = false;
    loadTrackFull(trackId).then(async (t) => {
      if (off) return;
      setTrack(t);
      dbRef.current = await labOpen(t.dataset);
      setSchema(labSchema(dbRef.current));
    }).catch(() => setTrack(false));
    return () => { off = true; dbRef.current?.close(); };
  }, [trackId]);

  // O Mentor enxerga o que você está escrevendo aqui.
  useEffect(() => {
    if (!track) return;
    mentor.setBase({ page: 'laboratório SQL', trackId: track.id, trackTitle: track.title, schema: schema.map((t) => `${t.name}(${t.cols.map((c) => c.name).join(', ')})`).join('\n') });
  }, [track, schema.length]);
  useEffect(() => { mentor.patch({ userSql: sql, lastError: out?.error || undefined }); store(`trilhas:lab:sql:${trackId}`, sql); }, [sql, out]);

  const run = () => {
    if (!dbRef.current || !sql.trim()) return;
    const r = labExec(dbRef.current, sql);
    setOut(r);
    setSchema(labSchema(dbRef.current));
    if (!r.error) {
      const h = [sql.trim(), ...history.filter((x) => x !== sql.trim())].slice(0, 15);
      setHistory(h);
      store(`trilhas:lab:hist:${trackId}`, h);
    }
  };

  const restore = async () => {
    if (!confirm('Restaurar o banco ao estado original? As alterações feitas aqui serão perdidas.')) return;
    dbRef.current?.close();
    dbRef.current = await labOpen(track.dataset);
    setSchema(labSchema(dbRef.current));
    setOut(null);
    flash('Banco restaurado.');
  };

  const saveNote = async () => {
    const first = sql.split('\n').find((l) => l.trim()) || 'Consulta';
    const title = (first.startsWith('--') ? first.replace(/^--\s*/, '') : `Consulta: ${first}`).slice(0, 70);
    const body = `\`\`\`sql\n${sql.trim()}\n\`\`\`\n${out && !out.error && out.results.length ? `\nDevolveu ${out.results[out.results.length - 1].values.length} linha(s).` : ''}`;
    const r = await fetch('/api/notes', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body, tags: ['sql', 'laboratorio'], source: { trackId: track.id, trackTitle: track.title } }),
    });
    if (r.ok) { mentor.bumpNotes?.(); flash('Consulta salva nas notas.'); } else flash('Não consegui salvar a nota.');
  };

  const copy = async () => { try { await navigator.clipboard.writeText(sql); flash('SQL copiado.'); } catch { flash('Não consegui copiar.'); } };

  if (track === false) return <div className="page center"><Mascot mood="sad" size={90} /><p>Trilha não encontrada.</p><button className="btn primary" onClick={() => go('/')}>Voltar</button></div>;
  if (!track) return <div className="page center"><Mascot size={90} className="bob" /><p className="muted">Abrindo o laboratório…</p></div>;
  if (!track.dataset) return <div className="page center"><Mascot mood="think" size={90} /><p>Esta trilha não tem um banco de dados para o laboratório.</p><button className="btn primary" onClick={() => go(`/t/${track.id}`)}>Voltar</button></div>;

  const last = out?.results?.length ? out.results : [];
  return (
    <div className="page lab">
      <div className="path-head">
        <button className="iconbtn" onClick={() => go(`/t/${track.id}`)} aria-label="Voltar"><Icon name="arrow-left" size={22} /></button>
        <b className="ph-title"><Icon name="lab" size={20} /> Laboratório · {track.title}</b>
      </div>
      <p className="muted small">Escreva qualquer SQL, sem exercício e sem correção. Use <kbd>Ctrl</kbd>+<kbd>Enter</kbd> para executar.</p>

      <details className="schema">
        <summary><Icon name="database" size={18} /> Tabelas <span className="muted small">({schema.length})</span></summary>
        <div className="tables">
          {schema.map((t) => (
            <div key={t.name} className="tbox">
              <div className="thead">
                <b>{t.name}</b> <span className="muted small">{t.type === 'view' ? 'view · ' : ''}{t.count} linhas</span>
                <button type="button" className="mini-use" onClick={() => setSql(`SELECT * FROM ${t.name} LIMIT 10;`)}>usar</button>
              </div>
              <div className="cols">
                {t.cols.map((c) => <span key={c.name} className={`col-pill ${c.pk ? 'pk' : ''}`}>{c.pk && <Icon name="key" size={12} stroke={2.6} />}{c.name}<i>{c.type.toLowerCase()}</i></span>)}
              </div>
            </div>
          ))}
        </div>
      </details>

      <div className="chips">{EXAMPLES.map((e, i) => <button key={i} className="chip" onClick={() => setSql(e)}>Exemplo {i + 1}</button>)}</div>
      <Editor value={sql} onChange={setSql} onRun={run} />
      <div className="row gap">
        <button className="btn primary sm" onClick={run}><Icon name="play" size={15} fill="currentColor" /> Executar</button>
        <button className="btn ghost sm" onClick={saveNote}><Icon name="bookmark" size={16} /> Salvar nas notas</button>
        <button className="btn ghost sm" onClick={() => mentor.open(out?.error ? 'Por que minha consulta deu erro?' : 'Explica o que essa consulta faz e como posso melhorá-la.')}><Icon name="chat" size={16} /> Perguntar ao Mentor</button>
        <button className="btn ghost sm" onClick={copy} aria-label="Copiar SQL"><Icon name="copy" size={16} /></button>
        <button className="btn ghost sm" onClick={restore}><Icon name="reset" size={16} /> Restaurar banco</button>
      </div>

      {out?.error && <div className="callout err"><Icon name="alert" size={18} /><span>{out.error}</span></div>}
      {out && !out.error && last.length === 0 && <div className="callout"><Icon name="check" size={18} /><span>Comando executado com sucesso{out.changes ? ` — ${out.changes} linha(s) afetada(s)` : ''}.</span></div>}
      {last.map((r, i) => <ResultTable key={i} result={r} max={100} />)}

      {history.length > 0 && (
        <>
          <h3 className="sec">Histórico</h3>
          <div className="notelist">
            {history.map((h) => (
              <button key={h} className="histitem" onClick={() => setSql(h)}><Code code={h.length > 160 ? `${h.slice(0, 160)}…` : h} /></button>
            ))}
          </div>
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

