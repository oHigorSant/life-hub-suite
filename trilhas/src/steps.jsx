import { useEffect, useMemo, useRef, useState } from 'react';
import { Code, RichText, ResultTable, highlight } from './ui.jsx';
import { Mascot, ChapterArt, kindFor } from './art.jsx';
import { Icon } from './icons.jsx';
import { useMentor } from './mentor.jsx';
import { getSchema, runPreview, grade, expectedFor, tablesUsed } from './sqlEngine.js';

// Embaralha de forma DETERMINÍSTICA (semente = conteúdo do exercício): a ordem das opções nunca muda
// entre renderizações nem ao reabrir o exercício.
function seeded(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const shuffle = (arr, avoid, salt = '') => {
  const rnd = seeded(salt + JSON.stringify(arr));
  const a = arr.map((v, i) => ({ v, i }));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // evita devolver exatamente a ordem certa (exercícios de ordenar)
  if (avoid && a.length > 1 && a.every((x, i) => x.i === i)) a.push(a.shift());
  return a;
};
/* Contrato: cada passo chama `register({ ready, check })` sempre que muda.
   check() -> { ok, detail? } (pode ser async).  `verdict` = 'ok' | 'bad' | null após verificar. */

// Card de leitura. Textos com 3+ blocos (parágrafos/exemplo de código) aparecem UM bloco por vez ("Continuar" revela o
// próximo) — como as quebras (`break`) das lições do Mimo: leitura curta, sem parede de texto.
export function ReadStep({ step, register, chapter, first }) {
  const blocks = useMemo(() => {
    const out = String(step.body || '').split(/\n\n+/).filter(Boolean).map((t) => ({ kind: 'text', t }));
    if (step.code) out.push({ kind: 'code', t: step.code });
    return out;
  }, [step]);
  const progressive = blocks.length >= 3;
  const [shown, setShown] = useState(progressive ? 1 : blocks.length);
  const more = shown < blocks.length;
  const reveal = () => { if (!more) return false; setShown(shown + 1); return true; };
  useEffect(() => register({ ready: true, check: () => ({ ok: true }), isRead: true, reveal }), [shown]);
  return (
    <div className="step read" onClick={() => progressive && reveal()}>
      {first && chapter && (
        <div className="readhero" style={{ '--cc': chapter.color }}>
          <ChapterArt kind={kindFor(chapter, 0)} />
          <Mascot size={92} className="bob" />
        </div>
      )}
      <div className="read-head">{!(first && chapter) && <Mascot size={64} className="bob" />}<h2>{step.title}</h2></div>
      {blocks.slice(0, shown).map((b, i) => (
        <div key={i} className={progressive ? 'reveal' : ''}>
          {b.kind === 'code' ? <Code code={b.t} /> : <RichText text={b.t} />}
        </div>
      ))}
      {more && <p className="tapmore"><Icon name="chevron-down" size={16} stroke={2.6} /> Toque para continuar ({shown}/{blocks.length})</p>}
    </div>
  );
}
export function QuizStep({ step, register, verdict, locked }) {
  const [sel, setSel] = useState(null);
  useEffect(() => register({ ready: sel !== null, check: () => ({ ok: sel === step.answer }) }), [sel]);
  return (
    <div className="step">
      <RichText text={step.q} className="q" />
      {step.code && <Code code={step.code} />}
      <div className="opts">
        {step.options.map((o, i) => (
          <button key={i} disabled={locked} onClick={() => setSel(i)}
            className={`opt ${sel === i ? 'sel' : ''} ${sel === i && verdict ? verdict : ''}`}>
            <span className="optkey">{String.fromCharCode(65 + i)}</span>
            <span><RichText text={o} /></span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function FillStep({ step, register, verdict, locked }) {
  const bank = useMemo(() => shuffle(step.bank), [step]);
  const n = step.answer.length;
  const [slots, setSlots] = useState(Array(n).fill(null)); // guarda índice no `bank` embaralhado
  const filled = slots.every((s) => s !== null);
  useEffect(() => register({
    ready: filled,
    check: () => ({ ok: slots.every((s, i) => bank[s].v === step.answer[i]) }),
  }), [slots]);

  const put = (bi) => {
    const k = slots.indexOf(null);
    if (k < 0 || slots.includes(bi)) return;
    setSlots(slots.map((s, i) => (i === k ? bi : s)));
  };
  const clear = (k) => !locked && setSlots(slots.map((s, i) => (i === k ? null : s)));

  const parts = step.code.split('___');
  return (
    <div className="step">
      <RichText text={step.prompt} className="q" />
      <pre className="codeblock fillcode"><code>
        {parts.map((p, i) => (
          <span key={i}>
            {highlight(p)}
            {i < parts.length - 1 && (
              <button className={`slot ${slots[i] !== null ? 'full' : ''} ${slots[i] !== null && verdict ? verdict : ''}`} onClick={() => clear(i)}>
                {slots[i] !== null ? bank[slots[i]].v : ' '}
              </button>
            )}
          </span>
        ))}
      </code></pre>
      <div className="bank">
        {bank.map((b, bi) => (
          <button key={bi} className={`chip ${slots.includes(bi) ? 'used' : ''}`} disabled={locked || slots.includes(bi)} onClick={() => put(bi)}>{b.v}</button>
        ))}
      </div>
    </div>
  );
}

export function OrderStep({ step, register, verdict, locked }) {
  const items = useMemo(() => shuffle(step.lines, true), [step]);
  const [placed, setPlaced] = useState([]);
  useEffect(() => register({
    ready: placed.length === items.length,
    check: () => ({ ok: placed.every((p, i) => items[p].v === step.lines[i]) }),
  }), [placed]);
  return (
    <div className="step">
      <RichText text={step.prompt} className="q" />
      <div className={`dropzone ${verdict || ''}`}>
        {placed.length === 0 && <span className="muted small">Toque nas linhas abaixo para montar o código</span>}
        {placed.map((p) => (
          <button key={p} className="chip line" disabled={locked} onClick={() => setPlaced(placed.filter((x) => x !== p))}>{items[p].v}</button>
        ))}
      </div>
      <div className="bank col">
        {items.map((it, i) => (
          <button key={i} className={`chip line ${placed.includes(i) ? 'used' : ''}`} disabled={locked || placed.includes(i)} onClick={() => setPlaced([...placed, i])}>{it.v}</button>
        ))}
      </div>
    </div>
  );
}

export function MatchStep({ step, register, onMistake }) {
  const left = useMemo(() => shuffle(step.pairs.map((p) => p[0]), false, 'L'), [step]);
  const right = useMemo(() => shuffle(step.pairs.map((p) => p[1]), false, 'R'), [step]);
  const [selL, setSelL] = useState(null);
  const [done, setDone] = useState({}); // leftIdx(original) -> true
  const [bad, setBad] = useState(null);
  const total = step.pairs.length;
  const matchedCount = Object.keys(done).length;
  useEffect(() => register({ ready: matchedCount === total, check: () => ({ ok: true }), auto: true }), [matchedCount]);

  const pickRight = (r) => {
    if (selL === null) return;
    const ok = step.pairs[left[selL].i][1] === right[r].v;
    if (ok) {
      setDone({ ...done, [left[selL].i]: right[r].i });
      setSelL(null);
    } else {
      setBad({ l: selL, r });
      onMistake?.();
      setTimeout(() => setBad(null), 500);
      setSelL(null);
    }
  };
  const rightDone = (r) => Object.values(done).includes(right[r].i);
  return (
    <div className="step">
      <RichText text={step.prompt} className="q" />
      <div className="match">
        <div className="col">
          {left.map((l, i) => (
            <button key={i} disabled={done[l.i] !== undefined} onClick={() => setSelL(i)}
              className={`mt ${selL === i ? 'sel' : ''} ${done[l.i] !== undefined ? 'ok' : ''} ${bad?.l === i ? 'bad' : ''}`}>{l.v}</button>
          ))}
        </div>
        <div className="col">
          {right.map((r, i) => (
            <button key={i} disabled={rightDone(i)} onClick={() => pickRight(i)}
              className={`mt ${rightDone(i) ? 'ok' : ''} ${bad?.r === i ? 'bad' : ''}`}>{r.v}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Editor SQL com realce (textarea + camada colorida) ---------- */
const SNIPS = ['*', ',', '(', ')', "'", '=', '>', '<', '%', ';', '.', '||'];

export function Editor({ value, onChange, disabled, onRun }) {
  const ta = useRef();
  const pre = useRef();
  const sync = () => { if (pre.current && ta.current) { pre.current.scrollTop = ta.current.scrollTop; pre.current.scrollLeft = ta.current.scrollLeft; } };
  const insert = (s) => {
    const el = ta.current;
    const a = el.selectionStart, b = el.selectionEnd;
    const next = value.slice(0, a) + s + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + s.length, a + s.length); });
  };
  const lines = Math.max(4, value.split('\n').length + 1);
  return (
    <div className="editor">
      <div className="ed-box" style={{ height: `${Math.min(lines, 12) * 1.55 + 1.4}em` }}>
        <pre ref={pre} className="ed-hl" aria-hidden="true"><code>{highlight(value)}{'\n'}</code></pre>
        <textarea ref={ta} className="ed-ta" value={value} disabled={disabled} spellCheck={false} autoCapitalize="off" autoCorrect="off" autoComplete="off"
          placeholder="Escreva seu SQL aqui…" onChange={(e) => onChange(e.target.value)} onScroll={sync}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun(); }
            if (e.key === 'Tab') { e.preventDefault(); insert('  '); }
          }} />
      </div>
      <div className="snips">
        {SNIPS.map((s) => <button key={s} type="button" className="snip" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(s)}>{s}</button>)}
      </div>
    </div>
  );
}

function SchemaPanel({ trackId, dataset, step }) {
  const [tables, setTables] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => { getSchema(trackId, dataset, step).then(setTables).catch(() => {}); }, [trackId, step]);
  if (!tables.length) return null;
  return (
    <details className="schema">
      <summary><Icon name="database" size={18} /> Banco de dados <span className="muted small">({tables.length} tabelas)</span></summary>
      <div className="tables">
        {tables.map((t) => (
          <div key={t.name} className="tbox">
            <button className="thead" onClick={() => setOpen(open === t.name ? null : t.name)}>
              <b>{t.name}</b> <span className="muted small">{t.count} linhas</span>
            </button>
            <div className="cols">
              {t.cols.map((c) => <span key={c.name} className={`col-pill ${c.pk ? 'pk' : ''}`}>{c.pk && <Icon name="key" size={12} stroke={2.6} />}{c.name}<i>{c.type.toLowerCase()}</i></span>)}
            </div>
            {open === t.name && t.sample && <ResultTable result={t.sample} />}
          </div>
        ))}
      </div>
    </details>
  );
}

// "Dados e resultado esperado": mostra as tabelas usadas e a saída que o aluno deve obter, antes de ele escrever.
function ExpectedPanel({ step, track }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let off = false;
    Promise.all([tablesUsed(track.id, step, track.dataset), expectedFor(step, track.dataset)])
      .then(([tables, expected]) => { if (!off) setData({ tables, expected }); })
      .catch(() => {});
    return () => { off = true; };
  }, [step]);
  if (!data || (!data.tables.length && !data.expected)) return null;
  return (
    <details className="schema expected" open>
      <summary><Icon name="eye" size={18} /> Dados e resultado esperado</summary>
      {data.tables.map((t) => (
        <div key={t.name} className="exp-block">
          <p className="hm-label"><b>{t.name}</b> <span className="muted small">primeiras linhas de {t.count}</span></p>
          {t.sample && <ResultTable result={t.sample} max={3} />}
        </div>
      ))}
      {data.expected && (
        <div className="exp-block goal">
          <p className="hm-label"><Icon name="target" size={14} stroke={2.6} /> <b>Sua consulta deve devolver</b></p>
          <ResultTable result={data.expected} max={5} />
        </div>
      )}
    </details>
  );
}

export function QueryStep({ step, register, verdict, locked, track }) {
  const [sql, setSql] = useState(step.starter || '');
  const [out, setOut] = useState(null); // { result, error, reason }
  const [hint, setHint] = useState(false);
  const [ai, setAi] = useState({ loading: false, text: '', err: '' });
  const mentor = useMentor();
  const sqlRef = useRef(sql);
  sqlRef.current = sql;
  useEffect(() => { mentor.patch({ userSql: sql }); }, [sql]);
  useEffect(() => { mentor.patch({ lastError: out?.error || out?.reason || undefined }); }, [out]);
  useEffect(() => {
    getSchema(track.id, track.dataset, step).then((tb) => mentor.patch({ schema: tb.map((t) => `${t.name}(${t.cols.map((c) => c.name).join(', ')})`).join('\n') })).catch(() => {});
  }, [step]);

  useEffect(() => register({
    ready: sql.trim().length > 0,
    check: async () => {
      const r = await grade(step, track.dataset, sqlRef.current);
      setOut(r);
      return { ok: r.ok, detail: r.error ? `Erro: ${r.error}` : r.reason };
    },
  }), [sql]);

  const run = async () => setOut(await runPreview(step, track.dataset, sql));

  const askAi = async () => {
    setAi({ loading: true, text: '', err: '' });
    try {
      const tables = await getSchema(track.id, track.dataset, step);
      const schema = tables.map((t) => `${t.name}(${t.cols.map((c) => c.name).join(', ')})`).join('\n');
      const r = await fetch('/api/ai/hint', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: step.prompt, sql, error: out?.error, schema }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setAi({ loading: false, text: j.hint, err: '' });
    } catch {
      setAi({ loading: false, text: '', err: 'A IA não está disponível agora. Use a dica padrão.' });
    }
  };

  return (
    <div className="step">
      <RichText text={step.prompt} className="q" />
      <ExpectedPanel step={step} track={track} />
      <SchemaPanel trackId={track.id} dataset={track.dataset} step={step} />
      <Editor value={sql} onChange={setSql} disabled={locked && verdict === 'ok'} onRun={run} />
      <div className="row gap">
        <button className="btn ghost sm" onClick={run}><Icon name="play" size={15} fill="currentColor" /> Executar</button>
        <button className="btn ghost sm" onClick={() => setHint(true)}><Icon name="bulb" size={16} /> Dica</button>
        <button className="btn ghost sm" onClick={askAi} disabled={ai.loading}>{ai.loading ? 'Pensando…' : <><Icon name="sparkles" size={16} /> Dica da IA</>}</button>
        {sql !== (step.starter || '') && <button className="btn ghost sm" onClick={() => { setSql(step.starter || ''); setOut(null); }} aria-label="Restaurar"><Icon name="reset" size={16} /></button>}
      </div>
      {hint && step.hint && <div className="callout"><Icon name="bulb" size={18} /><span>{step.hint}</span></div>}
      {ai.text && <div className="callout ai"><Icon name="sparkles" size={18} /><span>{ai.text}</span></div>}
      {ai.err && <div className="callout muted">{ai.err}</div>}
      {out?.error && <div className="callout err"><Icon name="alert" size={18} /><span>{out.error}</span></div>}
      {out && !out.error && <ResultTable result={out.result} />}
    </div>
  );
}

// Resposta digitada (como o "validatedInput" do Mimo): compara sem diferenciar maiúsculas e espaços extras.
export function InputStep({ step, register, verdict, locked }) {
  const [val, setVal] = useState('');
  const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();
  useEffect(() => register({
    ready: val.trim().length > 0,
    check: () => ({ ok: step.answers.some((a) => norm(a) === norm(val)) }),
  }), [val]);
  return (
    <div className="step">
      <RichText text={step.prompt} className="q" />
      {step.code && <Code code={step.code} />}
      <input className={`typein ${verdict || ''}`} value={val} disabled={locked} autoCapitalize="off" autoCorrect="off" autoComplete="off" spellCheck={false}
        placeholder={step.placeholder || 'Digite a resposta'} onChange={(e) => setVal(e.target.value)} />
    </div>
  );
}

export const STEP_COMPONENTS = { read: ReadStep, quiz: QuizStep, fill: FillStep, order: OrderStep, match: MatchStep, input: InputStep, query: QueryStep };
