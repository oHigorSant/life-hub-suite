import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Mascot } from './art.jsx';
import { Icon } from './icons.jsx';
import { Markdown } from './ui.jsx';

const Ctx = createContext(null);
export const useMentor = () => useContext(Ctx);

const WELCOME = 'Oi! Eu sou o Mentor. Pergunte qualquer dúvida sobre o que você está estudando — eu vejo em que lição e exercício você está. Se quiser guardar algo, é só pedir: "salva isso nas notas".';

export function MentorProvider({ children, go }) {
  const [open, setOpen] = useState(false);
  const baseRef = useRef({});
  const liveRef = useRef({});
  const [ctxLabel, setCtxLabel] = useState('');
  const [notesVersion, setNotesVersion] = useState(0);
  const [prefill, setPrefill] = useState('');

  const label = (c) => [c.trackTitle, c.lessonTitle || c.chapterTitle || c.page].filter(Boolean).join(' · ');
  const setBase = useCallback((b) => { baseRef.current = b; liveRef.current = {}; setCtxLabel(label(b)); }, []);
  const patch = useCallback((p) => { liveRef.current = { ...liveRef.current, ...p }; }, []);
  const getContext = useCallback(() => ({ ...baseRef.current, ...liveRef.current }), []);
  const openMentor = useCallback((text = '') => { setPrefill(text); setOpen(true); }, []);

  const value = useMemo(() => ({ label: ctxLabel, open: openMentor, setBase, patch, getContext, notesVersion, bumpNotes: () => setNotesVersion((v) => v + 1) }), [ctxLabel, openMentor, setBase, patch, getContext, notesVersion]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && <ChatView onClose={() => setOpen(false)} label={ctxLabel} prefill={prefill} go={go} />}
    </Ctx.Provider>
  );
}

export function MentorFab() {
  const m = useMentor();
  return (
    <button className="mentor-fab" onClick={() => m.open()} aria-label="Falar com o Mentor">
      <Mascot size={46} />
    </button>
  );
}

export function MentorButton() {
  const m = useMentor();
  return (
    <button className="iconbtn mentorbtn" onClick={() => m.open()} aria-label="Falar com o Mentor">
      <Mascot size={32} />
    </button>
  );
}

function suggestions(ctx) {
  const s = ctx.step;
  if (s?.type === 'query') return ['Me dá uma dica', 'Por que meu SQL não funciona?', 'Explica o conceito de outro jeito'];
  if (s?.type) return ['Explica de outro jeito', 'Me dá um exemplo', 'Por que essa é a resposta?'];
  if (ctx.page === 'mentor') return ['O que devo estudar agora?', 'Revisa o que aprendi até aqui', 'Me passa um desafio'];
  if (ctx.note) return ['Resume esta nota', 'Quais perguntas de revisão?'];
  return ['O que devo estudar agora?', 'Explica um conceito'];
}

// Chat do Mentor: painel sobreposto (padrão) ou página inteira (page, aba Mentor).
export function ChatView({ onClose, label, prefill, go, page }) {
  const m = useMentor();
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState(prefill || '');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState({});
  const endRef = useRef();
  const taRef = useRef();
  const ctx = m.getContext();

  useEffect(() => {
    fetch('/api/mentor/history').then((r) => r.json()).then(setMsgs).catch(() => setMsgs([]));
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, sending]);
  useEffect(() => { setTimeout(() => taRef.current?.focus(), 250); }, []);

  const send = async (override) => {
    const message = (override ?? text).trim();
    if (!message || sending) return;
    setText(''); setErr(''); setSending(true);
    setMsgs((x) => [...(x || []), { id: `u${Date.now()}`, role: 'user', text: message }]);
    try {
      const r = await fetch('/api/mentor/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, context: m.getContext() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'falha');
      setMsgs((x) => [...x, j.message]);
      if (j.notes?.length) m.bumpNotes();
    } catch (e) {
      setErr('Não consegui falar com o Mentor agora. O Claude do servidor precisa estar logado e acessível. Tente de novo.');
    } finally {
      setSending(false);
    }
  };

  const saveMsg = async (msg) => {
    const c = m.getContext();
    const first = msg.text.replace(/```[\s\S]*?```/g, '').split('\n').find((l) => l.trim()) || 'Anotação do Mentor';
    const title = first.replace(/[*`#]/g, '').slice(0, 70);
    const source = c.trackTitle ? { trackId: c.trackId, trackTitle: c.trackTitle, chapterTitle: c.chapterTitle, lessonId: c.lessonId, lessonTitle: c.lessonTitle } : null;
    await fetch('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, body: msg.text, tags: ['mentor'], source }) });
    setSaved((s) => ({ ...s, [msg.id]: true }));
    m.bumpNotes();
  };

  const clear = async () => {
    if (!confirm('Apagar toda a conversa com o Mentor? (suas notas continuam salvas)')) return;
    await fetch('/api/mentor/history', { method: 'DELETE' });
    setMsgs([]);
  };

  const chips = suggestions(ctx);

  const card = (
      <section className={`mentor-panel ${page ? 'page' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mentor">
        <header className="mentor-head">
          <Mascot size={44} />
          <div className="mh-text"><b>Mentor</b><span className="small">{label || 'Pergunte o que quiser'}</span></div>
          <button className="iconbtn" onClick={clear} aria-label="Limpar conversa"><Icon name="trash" size={19} /></button>
          {!page && <button className="iconbtn" onClick={onClose} aria-label="Fechar"><Icon name="x" size={22} stroke={2.6} /></button>}
        </header>

        <div className="mentor-msgs">
          <div className="bubble mentor welcome"><Markdown text={WELCOME} /></div>
          {(msgs || []).map((msg) => (
            <div key={msg.id} className={`msgrow ${msg.role}`}>
              <div className={`bubble ${msg.role}`}>
                <Markdown text={msg.text} />
                {msg.notes?.length > 0 && (
                  <div className="notechips">
                    {msg.notes.map((n) => (
                      <button key={n.id} className="notechip" onClick={() => { onClose?.(); go('/notas'); }}>
                        <Icon name="bookmark-check" size={15} /> <span>Nota salva: {n.title}</span>
                        {n.hub === 'synced' && <Icon name="cloud-check" size={14} className="ok" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {msg.role === 'mentor' && !msg.notes?.length && (
                <button className={`savebtn ${saved[msg.id] ? 'on' : ''}`} disabled={saved[msg.id]} onClick={() => saveMsg(msg)}>
                  <Icon name={saved[msg.id] ? 'bookmark-check' : 'bookmark'} size={15} /> {saved[msg.id] ? 'Salvo nas notas' : 'Salvar nas notas'}
                </button>
              )}
            </div>
          ))}
          {sending && <div className="msgrow mentor"><div className="bubble mentor typing"><i /><i /><i /></div></div>}
          {err && <div className="callout err"><Icon name="alert" size={18} /><span>{err}</span></div>}
          <div ref={endRef} />
        </div>

        <div className="mentor-chips">
          {chips.map((c) => <button key={c} className="chip" disabled={sending} onClick={() => send(c)}>{c}</button>)}
          <button className="chip" disabled={sending} onClick={() => send('Salva nas notas um resumo do que acabamos de ver.')}><Icon name="notes" size={15} /> Salvar resumo nas notas</button>
        </div>

        <form className="mentor-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea ref={taRef} rows={1} value={text} placeholder="Escreva sua dúvida…" disabled={sending}
            onChange={(e) => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(120, e.target.scrollHeight) + 'px'; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send(); } }} />
          <button className="sendbtn" type="submit" disabled={sending || !text.trim()} aria-label="Enviar"><Icon name="send" size={20} stroke={2.4} /></button>
        </form>
      </section>
  );
  return page ? card : <div className="mentor-backdrop" onClick={onClose}>{card}</div>;
}

export function MentorPage({ go }) {
  const m = useMentor();
  return <div className="mentor-pagewrap"><ChatView page go={go} label={m.label} /></div>;
}
