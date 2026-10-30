import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProgressProvider, useProgress } from './store.jsx';
import { Home, Path, Profile, Create, TopStats } from './screens.jsx';
import Lesson from './Lesson.jsx';
import { Mascot } from './art.jsx';
import { Icon } from './icons.jsx';
import { MentorProvider, MentorFab, MentorPage, useMentor } from './mentor.jsx';
import Notes from './notes.jsx';
import Certificate from './certificate.jsx';
import Lab from './lab.jsx';
import EditTrack from './edit.jsx';
import { practiceNodes, buildPractice } from './practice.js';

const useHash = () => {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => setH(location.hash.slice(1) || '/');
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return [h, (to) => { location.hash = to; }];
};

function Shell() {
  const { p, dispatch } = useProgress();
  const [route, go] = useHash();
  const [tracks, setTracks] = useState(null);
  const cache = useRef({});

  const refresh = useCallback(() => fetch('/api/tracks').then((r) => r.json()).then(setTracks).catch(() => setTracks([])), []);
  useEffect(() => { refresh(); }, []);

  const loadTrackFull = useCallback(async (id, force) => {
    if (!force && cache.current[id] && !cache.current[id].generating) return cache.current[id];
    const t = await (await fetch(`/api/tracks/${id}`)).json();
    cache.current[id] = t;
    return t;
  }, []);

  // Aba Mentor: ele enxerga o progresso do aluno na trilha atual.
  useEffect(() => {
    if (!route.startsWith('/mentor')) return;
    const id = p.lastTrack || tracks?.[0]?.id;
    if (!id) { mentor.setBase({ page: 'mentor' }); return; }
    loadTrackFull(id).then((t) => {
      const flat = t.chapters.flatMap((c) => c.lessons.map((l) => ({ c, l })));
      const done = p.done[id] || {};
      const next = flat.find((x) => !done[x.l.id]);
      const learned = flat.filter((x) => done[x.l.id]).map((x) => x.l.title);
      mentor.setBase({
        page: 'mentor', trackId: id, trackTitle: t.title,
        progress: `${learned.length} de ${flat.length} lições concluídas. Concluídas: ${learned.join('; ') || 'nenhuma'}. Próxima lição: ${next ? `${next.l.title} (capítulo ${next.c.title})` : 'trilha completa'}.`,
      });
    }).catch(() => mentor.setBase({ page: 'mentor' }));
  }, [route, tracks, p.lastTrack]);
  const [, tid, lid] = route.match(/^\/t\/([^/]+)(?:\/([^/]+))?/) || [];
  const labId = route.match(/^\/lab\/([^/]+)/)?.[1];
  const [full, setFull] = useState(null);
  useEffect(() => {
    setFull(null);
    if (!tid) return;
    loadTrackFull(tid, true).then((t) => { setFull(t); dispatch({ type: 'lastTrack', id: tid }); }).catch(() => setFull(false));
  }, [tid]);

  // Trilha ainda sendo gerada: atualiza sozinha.
  useEffect(() => {
    if (!full?.generating) return;
    const t = setInterval(() => loadTrackFull(tid, true).then((next) => setFull((prev) => mergeTrack(prev, next))), 4000);
    return () => clearInterval(t);
  }, [full?.generating, tid]);

  const tab = route.startsWith('/mentor') ? 'mentor' : route.startsWith('/notas') ? 'notas' : route.startsWith('/perfil') ? 'perfil' : route.startsWith('/criar') ? 'criar' : tid ? 'aprender' : 'trilhas';
  const inLesson = !!lid;
  const mentor = useMentor();
  // Contexto do Mentor nas telas fora da lição (a lição define o próprio).
  useEffect(() => {
    if (lid || labId || route.startsWith('/notas') || route.startsWith('/mentor')) return;
    if (tid && full) mentor.setBase({ page: 'mapa da trilha', trackId: tid, trackTitle: full.title });
    else mentor.setBase({ page: route.startsWith('/perfil') ? 'perfil' : route.startsWith('/criar') ? 'criar trilha' : 'lista de trilhas' });
  }, [route, tid, full, lid]);

  // Treino rápido e Práticas (obrigatória/opcional): exercícios sorteados das lições JÁ vistas — nada novo, só reforço.
  // O sorteio fica fixo enquanto a tela estiver aberta.
  const isPractice = lid === 'treino' || lid?.startsWith('p-');
  const practice = useMemo(() => {
    if (!isPractice || !full) return null;
    const done = p.done[tid] || {};
    if (lid === 'treino') {
      const pool = full.chapters.flatMap((c) => c.lessons.filter((l) => done[l.id]).flatMap((l) => l.steps.filter((s) => s.type !== 'read')));
      if (!pool.length) return false;
      const picked = pool.map((s) => [Math.random(), s]).sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]);
      return { id: 'treino', title: 'Treino rápido', icon: 'dumbbell', practice: true, steps: picked };
    }
    const node = practiceNodes(full).find((n) => n.id === lid);
    return node ? buildPractice(full, node, !done[node.id]) : false;
  }, [lid, full, tid]);
  let body;
  if (tid && full === null) body = <div className="page center"><Mascot size={90} className="bob" /><p className="muted">Carregando…</p></div>;
  else if (tid && full === false) body = <div className="page center"><Mascot mood="sad" size={90} /><p>Trilha não encontrada.</p><button className="btn primary" onClick={() => go('/')}>Voltar</button></div>;
  else if (tid && isPractice) {
    body = practice
      ? <Lesson key={lid} track={full} chapter={{ title: practice.title, color: full.color }} lesson={practice} nextLesson={null} onExit={() => go(`/t/${tid}`)} onNext={() => go(`/t/${tid}`)} />
      : <div className="page center"><Mascot mood="think" size={90} /><p>Conclua pelo menos uma lição para liberar o treino.</p><button className="btn primary" onClick={() => go(`/t/${tid}`)}>Voltar</button></div>;
  }
  else if (tid && lid === 'editar') body = full.custom
    ? <EditTrack key={tid} track={full} go={go} refresh={refresh} reload={() => loadTrackFull(tid, true).then(setFull)} />
    : <div className="page center"><p>Só trilhas criadas por IA podem ser editadas.</p><button className="btn primary" onClick={() => go(`/t/${tid}`)}>Voltar</button></div>;
  else if (tid && lid === 'certificado') body = <Certificate track={full} go={go} />;
  else if (tid && lid) {
    const flat = full.chapters.flatMap((c) => c.lessons.map((l) => ({ c, l })));
    const i = flat.findIndex((x) => x.l.id === lid);
    const cur = flat[i];
    body = cur
      ? <Lesson key={lid} track={full} chapter={cur.c} lesson={cur.l} nextLesson={flat[i + 1]?.l} onExit={() => go(`/t/${tid}`)} onNext={() => go(`/t/${tid}/${flat[i + 1].l.id}`)} />
      : <div className="page center"><p>Lição não encontrada.</p></div>;
  }
  else if (tid) body = <Path track={full} go={go} />;
  else if (labId) body = <Lab trackId={labId} loadTrackFull={loadTrackFull} go={go} />;
  else if (route.startsWith('/mentor')) body = <MentorPage go={go} />;
  else if (route.startsWith('/notas')) body = <Notes />;
  else if (route.startsWith('/perfil')) body = tracks ? <Profile tracks={tracks} loadTrackFull={loadTrackFull} go={go} /> : null;
  else if (route.startsWith('/criar')) body = <Create go={go} refresh={refresh} />;
  else body = tracks ? <Home tracks={tracks} loadTrackFull={loadTrackFull} go={go} /> : <div className="page center"><Mascot size={90} className="bob" /></div>;

  if (inLesson && body?.type === Lesson) return body;

  const lastTrack = p.lastTrack && tracks?.some((t) => t.id === p.lastTrack) ? p.lastTrack : tracks?.[0]?.id;
  const nav = [
    { id: 'aprender', icon: 'home', label: 'Aprender', to: lastTrack ? `/t/${lastTrack}` : '/' },
    { id: 'trilhas', icon: 'compass', label: 'Trilhas', to: '/' },
    { id: 'mentor', icon: 'chat', label: 'Mentor', to: '/mentor' },
    { id: 'notas', icon: 'notes', label: 'Notas', to: '/notas' },
    { id: 'perfil', icon: 'user', label: 'Perfil', to: '/perfil' },
  ];
  return (
    <div className={`app${EMBED ? ' embed' : ''}`}>
      <aside className="side">
        <div className="brand"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="34" height="34" /> <b>Trilhas</b></div>
        {nav.map((n) => <button key={n.id} className={`navitem ${tab === n.id ? 'on' : ''}`} onClick={() => go(n.to)}><Icon name={n.icon} size={22} />{n.label}</button>)}
      </aside>
      <div className="main">
        <header className="topbar"><div className="brand m"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="28" height="28" /> <b>Trilhas</b></div><TopStats /></header>
        <div className="content">{body}</div>
      </div>
      {tab !== 'notas' && tab !== 'mentor' && <MentorFab />}
      <nav className="tabbar">
        {nav.map((n) => <button key={n.id} className={tab === n.id ? 'on' : ''} onClick={() => go(n.to)}><span className="tabico"><Icon name={n.icon} size={24} stroke={tab === n.id ? 2.6 : 2.1} /></span><i>{n.label}</i></button>)}
      </nav>
    </div>
  );
}

// Dentro do Life Hub (iframe) a barra lateral e a marca do Trilhas somem: o Hub já tem as dele.
const EMBED = new URLSearchParams(location.search).has('embed');

// Atualização da trilha em geração: só troca o estado se algo mudou e reaproveita as lições já carregadas.
// (Antes cada atualização criava objetos novos e reembaralhava as opções dos exercícios abertos.)
const sig = (t) => `${!!t.generating}|${t.chapters.map((c) => c.lessons.map((l) => l.id).join(',')).join(';')}`;
function mergeTrack(prev, next) {
  if (!prev || prev === false) return next;
  if (sig(prev) === sig(next)) return prev;
  const known = new Map(prev.chapters.flatMap((c) => c.lessons.map((l) => [l.id, l])));
  return { ...next, chapters: next.chapters.map((c) => ({ ...c, lessons: c.lessons.map((l) => known.get(l.id) || l) })) };
}

const goHash = (to) => { location.hash = to; };

export default function App() {
  return <ProgressProvider><MentorProvider go={goHash}><Shell /></MentorProvider></ProgressProvider>;
}
