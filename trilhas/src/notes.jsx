import { useEffect, useMemo, useState } from 'react';
import { Icon } from './icons.jsx';
import { Mascot } from './art.jsx';
import { Markdown } from './ui.jsx';
import { useMentor } from './mentor.jsx';

const fmt = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const snippet = (b) => b.replace(/```[\s\S]*?```/g, ' ').replace(/[#*`>-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 110);

function HubBadge({ hub }) {
  if (!hub || hub.status === 'off') return null;
  return hub.status === 'synced'
    ? <span className="hubb ok"><Icon name="cloud-check" size={13} /> Life Hub</span>
    : <span className="hubb pend"><Icon name="cloud-off" size={13} /> pendente</span>;
}

export default function Notes() {
  const mentor = useMentor();
  const [data, setData] = useState({ notes: [], hub: false });
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState(null);
  const [edit, setEdit] = useState(null); // null | { id?, title, body, tags }
  const [busy, setBusy] = useState(false);

  const load = () => fetch('/api/notes').then((r) => r.json()).then((d) => { setData(d); setLoaded(true); }).catch(() => setLoaded(true));
  useEffect(() => { load(); }, [mentor.notesVersion]);

  // O Mentor enxerga a nota aberta.
  useEffect(() => {
    mentor.setBase({ page: 'notas', ...(edit ? { note: { title: edit.title, body: edit.body } } : {}) });
  }, [edit?.id, edit === null]);

  const tags = useMemo(() => [...new Set(data.notes.flatMap((n) => n.tags))].sort(), [data.notes]);
  const shown = data.notes.filter((n) => (!tag || n.tags.includes(tag)) && (!q || `${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())));
  const pending = data.notes.some((n) => n.hub?.status === 'pending');

  const save = async () => {
    if (!edit.title.trim() && !edit.body.trim()) return;
    setBusy(true);
    const body = JSON.stringify({ title: edit.title, body: edit.body, tags: edit.tags.split(',').map((t) => t.trim()).filter(Boolean), source: edit.source || null });
    const opts = { headers: { 'content-type': 'application/json' }, body };
    await fetch(edit.id ? `/api/notes/${edit.id}` : '/api/notes', { method: edit.id ? 'PUT' : 'POST', ...opts });
    setBusy(false); setEdit(null); load();
  };
  const del = async () => {
    if (!confirm('Excluir esta nota?')) return;
    await fetch(`/api/notes/${edit.id}`, { method: 'DELETE' });
    setEdit(null); load();
  };
  const sync = async () => { setBusy(true); setData(await (await fetch('/api/notes/sync', { method: 'POST' })).json()); setBusy(false); };

  if (edit) {
    return (
      <div className="page">
        <div className="path-head">
          <button className="iconbtn" onClick={() => setEdit(null)} aria-label="Voltar"><Icon name="arrow-left" size={22} /></button>
          <b className="ph-title">{edit.id ? 'Editar nota' : 'Nova nota'}</b>
          {edit.id && <button className="iconbtn" onClick={del} aria-label="Excluir"><Icon name="trash" size={20} /></button>}
        </div>
        <label className="field"><span>Título</span><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Ex.: Diferença entre WHERE e HAVING" maxLength={120} /></label>
        <label className="field"><span>Conteúdo (markdown)</span><textarea className="notearea" rows={12} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} placeholder="Escreva seus insights, exemplos de código, dúvidas…" /></label>
        <label className="field"><span>Tags (separadas por vírgula)</span><input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder="sql, joins" /></label>
        {edit.body && <details className="schema"><summary>Pré-visualização</summary><Markdown text={edit.body} /></details>}
        {edit.source?.lessonTitle && <p className="small muted">Origem: {[edit.source.trackTitle, edit.source.lessonTitle].join(' › ')}</p>}
        <div className="row gap">
          <button className="btn primary" onClick={save} disabled={busy}><Icon name="check" size={18} stroke={3} /> Salvar</button>
          <button className="btn ghost" onClick={() => mentor.open(edit.id ? 'Me ajuda a revisar esta nota: o que posso melhorar ou aprofundar?' : '')}><Icon name="chat" size={18} /> Perguntar ao Mentor</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="herowrap slim noteshero">
        <div className="herotext">
          <span className="eyebrow">Seu caderno</span>
          <h1>Notas</h1>
          <p>Insights, exemplos e dúvidas — salvos por você ou pelo Mentor{data.hub ? ' e espelhados no Life Hub' : ''}.</p>
        </div>
        <Icon name="notes" size={72} stroke={1.6} className="notesico" />
      </div>

      <div className="row gap">
        <div className="searchbox"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nas notas" /></div>
        <button className="btn primary sm" onClick={() => setEdit({ title: '', body: '', tags: '' })}><Icon name="plus" size={18} stroke={3} /> Nova</button>
      </div>
      {tags.length > 0 && <div className="chips">{tags.map((t) => <button key={t} className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? null : t)}><Icon name="tag" size={14} /> {t}</button>)}</div>}
      {pending && <button className="btn ghost sm" onClick={sync} disabled={busy}><Icon name="sync" size={16} /> Sincronizar notas pendentes com o Life Hub</button>}

      {loaded && shown.length === 0 && (
        <div className="empty">
          <Mascot mood="think" size={96} className="bob" />
          <b>{data.notes.length ? 'Nada encontrado' : 'Nenhuma nota ainda'}</b>
          <p className="muted small">Abra o Mentor durante uma lição e diga "salva nas notas" — ou toque em "Salvar nas notas" em qualquer resposta dele.</p>
          <button className="btn primary" onClick={() => mentor.open('Salva nas notas um resumo do que já aprendi.')}><Icon name="chat" size={18} /> Falar com o Mentor</button>
        </div>
      )}

      <div className="notelist">
        {shown.map((n) => (
          <button key={n.id} className="notecard" onClick={() => setEdit({ id: n.id, title: n.title, body: n.body, tags: n.tags.join(', '), source: n.source })}>
            <b>{n.title}</b>
            <span className="muted small">{snippet(n.body)}</span>
            <span className="notemeta">
              {n.source?.trackTitle && <span className="badge">{n.source.trackTitle}</span>}
              {n.tags.slice(0, 3).map((t) => <span key={t} className="tagpill">#{t}</span>)}
              <span className="grow" /><HubBadge hub={n.hub} /><span className="small muted">{fmt(n.updatedAt)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
