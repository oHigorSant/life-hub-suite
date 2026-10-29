import { useEffect, useRef } from 'react';

export { Mascot } from './art.jsx';

/* ---------- Texto rico: **negrito**, `código`, *itálico*, quebras de linha ---------- */
function inline(text, key) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${key}-${i++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${key}-${i++}`} className="ic">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${key}-${i++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
export function RichText({ text, className = '' }) {
  const paras = String(text ?? '').split(/\n\n+/);
  return (
    <div className={`rich ${className}`}>
      {paras.map((p, i) => (
        <p key={i}>
          {p.split('\n').map((line, j, arr) => (
            <span key={j}>{inline(line, `${i}-${j}`)}{j < arr.length - 1 && <br />}</span>
          ))}
        </p>
      ))}
    </div>
  );
}

/* ---------- Realce de sintaxe (SQL + genérico) ---------- */
const KW = new Set(('select from where and or not in between like is null as order by group having limit offset distinct join inner left right outer full cross on union all intersect except insert into values update set delete create table drop alter add column primary key foreign references default unique check index view with case when then else end exists asc desc over partition rows range unbounded preceding following current row cast integer text real if begin commit rollback transaction pragma explain query plan using natural true false').split(' '));
const FN = new Set('count sum avg min max round abs upper lower length substr trim replace coalesce ifnull nullif strftime date time datetime julianday row_number rank dense_rank lag lead ntile first_value last_value total group_concat typeof random printf instr'.split(' '));
export function highlight(code) {
  const re = /(--[^\n]*)|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-zÀ-ÿ_][\wÀ-ÿ]*)|(\s+)|([\s\S])/g;
  const out = [];
  let m, i = 0;
  while ((m = re.exec(code))) {
    const [t, com, str, dq, num, word] = m;
    let cls = null;
    if (com) cls = 'c';
    else if (str || dq) cls = 's';
    else if (num) cls = 'n';
    else if (word) cls = KW.has(word.toLowerCase()) ? 'k' : FN.has(word.toLowerCase()) ? 'f' : null;
    out.push(cls ? <span key={i++} className={`tk-${cls}`}>{t}</span> : t);
  }
  return out;
}
export function Code({ code, className = '' }) {
  return <pre className={`codeblock ${className}`}><code>{highlight(code)}</code></pre>;
}

/* ---------- Tabela de resultado ---------- */
export function ResultTable({ result, max = 50 }) {
  if (!result) return <div className="muted small">Sem linhas para mostrar.</div>;
  const rows = result.values.slice(0, max);
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr>{result.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} className={v === null ? 'nul' : typeof v === 'number' ? 'num' : ''}>{v === null ? 'NULL' : String(v)}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <div className="tbl-foot">{result.values.length} linha(s){result.values.length > max ? ` · mostrando ${max}` : ''}</div>
    </div>
  );
}

/* ---------- Confete ---------- */
export function Confetti({ burst = 120 }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
    resize();
    const colors = ['#7c5cff', '#ff6b9d', '#ffd34d', '#2bb673', '#2d9cdb', '#ff9f43'];
    const ps = Array.from({ length: burst }, () => ({
      x: innerWidth / 2, y: innerHeight * 0.38,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4,
      s: 6 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
      c: colors[(Math.random() * colors.length) | 0], life: 0,
    }));
    let raf;
    const tick = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      let alive = 0;
      for (const p of ps) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life++;
        if (p.y < innerHeight + 20) alive++;
        ctx.save();
        ctx.translate(p.x * dpr, p.y * dpr); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect((-p.s / 2) * dpr, (-p.s / 3) * dpr, p.s * dpr, (p.s / 1.6) * dpr);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [burst]);
  return <canvas ref={ref} className="confetti" />;
}

/* ---------- Sons (WebAudio, sem arquivos) ---------- */
let audio;
export function beep(kind, on = true) {
  if (!on) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'ok' ? [[660, 0], [880, 0.09]] : kind === 'win' ? [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]] : [[220, 0], [165, 0.1]];
    for (const [f, t] of notes) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = kind === 'bad' ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.2);
    }
  } catch {}
  try { navigator.vibrate?.(kind === 'bad' ? [30, 40, 30] : 12); } catch {}
}

/* ---------- Markdown simples (mentor e notas): parágrafos, listas, títulos e blocos ``` ---------- */
export function Markdown({ text, className = '' }) {
  const parts = String(text ?? '').split(/```[a-zA-Z]*\n?([\s\S]*?)```/);
  const out = [];
  parts.forEach((seg, pi) => {
    if (pi % 2 === 1) { out.push(<Code key={`c${pi}`} code={seg.replace(/\n$/, '')} />); return; }
    const lines = seg.split('\n');
    let list = null, para = [];
    const flushPara = () => { if (para.length) { out.push(<p key={`p${pi}-${out.length}`}>{para.map((l, i) => <span key={i}>{inline(l, `${pi}-${out.length}-${i}`)}{i < para.length - 1 && <br />}</span>)}</p>); para = []; } };
    const flushList = () => { if (list) { const Tag = list.ordered ? 'ol' : 'ul'; out.push(<Tag key={`l${pi}-${out.length}`}>{list.items.map((it, i) => <li key={i}>{inline(it, `li${pi}-${i}`)}</li>)}</Tag>); list = null; } };
    for (const line of lines) {
      const li = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
      const h = line.match(/^#{1,4}\s+(.*)$/);
      if (li) { flushPara(); const ordered = !!li[1]; if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; } list.items.push(li[2]); }
      else if (h) { flushPara(); flushList(); out.push(<h4 key={`h${pi}-${out.length}`}>{inline(h[1], `h${pi}`)}</h4>); }
      else if (!line.trim()) { flushPara(); flushList(); }
      else { flushList(); para.push(line); }
    }
    flushPara(); flushList();
  });
  return <div className={`rich md ${className}`}>{out}</div>;
}