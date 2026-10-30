import { useState } from 'react';
import { Icon } from './icons.jsx';

/* Edição de trilhas criadas por IA: renomear, remover capítulos/lições, excluir a trilha. */
export default function EditTrack({ track, go, refresh, reload }) {
  const [title, setTitle] = useState(track.title);
  const [subtitle, setSubtitle] = useState(track.subtitle || '');
  const [chapters, setChapters] = useState(() => track.chapters.map((c) => ({ id: c.id, title: c.title, desc: c.desc || '', lessons: c.lessons.map((l) => ({ id: l.id, title: l.title })) })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const setCh = (ci, patch) => setChapters((cs) => cs.map((c, i) => (i === ci ? { ...c, ...patch } : c)));
  const setLe = (ci, li, title) => setChapters((cs) => cs.map((c, i) => (i === ci ? { ...c, lessons: c.lessons.map((l, j) => (j === li ? { ...l, title } : l)) } : c)));
  const delLe = (ci, li) => setChapters((cs) => cs.map((c, i) => (i === ci ? { ...c, lessons: c.lessons.filter((_, j) => j !== li) } : c)));
  const delCh = (ci) => {
    if (chapters[ci].lessons.length && !confirm(`Excluir o capítulo "${chapters[ci].title}" e suas ${chapters[ci].lessons.length} lições?`)) return;
    setChapters((cs) => cs.filter((_, i) => i !== ci));
  };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/tracks/${track.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, subtitle, chapters }) });
      if (!r.ok) throw new Error((await r.json()).error || 'erro ao salvar');
      await reload();
      refresh();
      go(`/t/${track.id}`);
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  const del = async () => {
    if (!confirm(`Excluir a trilha "${track.title}"? Isso não pode ser desfeito.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/tracks/${track.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error || 'erro ao excluir');
      await refresh();
      go('/');
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <div className="page edit">
      <div className="path-head">
        <button className="iconbtn" onClick={() => go(`/t/${track.id}`)} aria-label="Voltar"><Icon name="arrow-left" size={22} /></button>
        <div className="ph-title"><b>Editar trilha</b></div>
      </div>
      <label className="field"><span>Nome</span><input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="field"><span>Descrição curta</span><input value={subtitle} maxLength={120} onChange={(e) => setSubtitle(e.target.value)} /></label>
      {chapters.map((c, ci) => (
        <section key={c.id} className="field editch">
          <div className="row editrow">
            <span className="eyebrow">Capítulo {ci + 1}</span>
            <button className="iconbtn" onClick={() => delCh(ci)} aria-label="Excluir capítulo"><Icon name="trash" size={18} /></button>
          </div>
          <input value={c.title} maxLength={80} onChange={(e) => setCh(ci, { title: e.target.value })} />
          <input value={c.desc} maxLength={200} placeholder="Descrição" onChange={(e) => setCh(ci, { desc: e.target.value })} />
          {c.lessons.map((l, li) => (
            <div key={l.id} className="row editrow">
              <input value={l.title} maxLength={80} onChange={(e) => setLe(ci, li, e.target.value)} />
              <button className="iconbtn" onClick={() => delLe(ci, li)} aria-label="Excluir lição"><Icon name="x" size={18} /></button>
            </div>
          ))}
        </section>
      ))}
      {err && <div className="callout err">{err}</div>}
      <button className="btn primary big" disabled={busy || title.trim().length < 2} onClick={save}>Salvar alterações</button>
      <button className="btn danger big" disabled={busy} onClick={del}><Icon name="trash" size={20} /> Excluir trilha</button>
    </div>
  );
}
