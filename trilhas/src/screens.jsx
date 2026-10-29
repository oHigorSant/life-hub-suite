import { useEffect, useState } from 'react';
import { Mascot, HeroArt, ChapterArt, TrackTile, kindFor, Burst } from './art.jsx';
import { Icon } from './icons.jsx';
import { chapterItems, sequenceOf } from './practice.js';
import { useProgress, trackStats, ACHIEVEMENTS, levelOf, liveStreak, DAILY_GOAL, today, totalDone, minutesLeft, fmtMin, MAX_FREEZES } from './store.jsx';

export function Ring({ pct, size = 56, stroke = 6, color = 'var(--brand)', children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--track)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct))} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

export function TopStats() {
  const { p } = useProgress();
  const goal = Math.min(1, (p.days[today()] || 0) / DAILY_GOAL);
  return (
    <div className="topstats">
      <span className="pill fire"><Icon name="flame" size={18} fill="currentColor" stroke={1.8} />{liveStreak(p)}</span>
      <span className="pill gold"><Icon name="zap" size={18} fill="currentColor" stroke={1.8} />{p.xp}</span>
      <Ring pct={goal} size={36} stroke={5} color="var(--green)"><Icon name="target" size={16} stroke={2.4} /></Ring>
    </div>
  );
}

/* ---------- Lista de trilhas ---------- */
export function Home({ tracks, loadTrackFull, go }) {
  const { p } = useProgress();
  const [full, setFull] = useState({});
  useEffect(() => { tracks.forEach((t) => loadTrackFull(t.id).then((f) => setFull((s) => ({ ...s, [t.id]: f })))); }, [tracks]);
  const goal = Math.min(1, (p.days[today()] || 0) / DAILY_GOAL);
  return (
    <div className="page">
      <div className="herowrap">
        <HeroArt />
        <div className="herotext">
          <h1>Bora aprender?</h1>
          <p>Escolha uma trilha ou peça para a IA criar uma nova.</p>
        </div>
      </div>
      <div className="dailygoal">
        <Ring pct={goal} size={46} stroke={6} color="var(--green)"><Icon name="target" size={18} stroke={2.4} /></Ring>
        <div><b>Meta diária</b><span className="muted small">{Math.min(p.days[today()] || 0, DAILY_GOAL)} de {DAILY_GOAL} XP hoje</span></div>
      </div>
      <h3 className="sec">Suas trilhas</h3>
      <div className="cards">
        {tracks.map((t) => {
          const st = full[t.id] ? trackStats(p, full[t.id]) : { done: 0, total: t.chapters.reduce((n, c) => n + c.lessons.length, 0), pct: 0 };
          return (
            <button key={t.id} className="tcard" style={{ '--c': t.color }} onClick={() => go(`/t/${t.id}`)} disabled={t.generating && !t.chapters.some((c) => c.lessons.length)}>
              <TrackTile icon={t.icon} color={t.color} />
              <div className="tinfo">
                <b>{t.title}</b>
                <span className="muted small">{t.subtitle}</span>
                <div className="bar slim"><i style={{ width: `${st.pct * 100}%` }} /></div>
                <span className="small row meta">{st.done}/{st.total} lições{full[t.id] && st.done < st.total ? ` · ${fmtMin(minutesLeft(full[t.id], p.done[t.id] || {}))}` : ''}{t.generating ? ' · gerando…' : ''}{t.custom && <span className="badge"><Icon name="sparkles" size={12} stroke={2.6} /> IA</span>}</span>
              </div>
              <Icon name="arrow-right" size={20} className="chev" />
            </button>
          );
        })}
        <button className="tcard create" onClick={() => go('/criar')}>
          <div className="ttile plus"><Icon name="sparkles" size={30} /></div>
          <div className="tinfo"><b>Criar trilha com IA</b><span className="muted small">Qualquer assunto: Python, inglês, violão, finanças…</span></div>
          <Icon name="plus" size={20} className="chev" />
        </button>
      </div>
    </div>
  );
}

/* ---------- Mapa da trilha ---------- */
export function Path({ track, go }) {
  const { p } = useProgress();
  const [toast, setToast] = useState('');
  const doneMap = p.done[track.id] || {};
  const seq = sequenceOf(track);
  const currentId = seq.find((id) => !doneMap[id]);
  const lessonsDone = track.chapters.every((c) => c.lessons.every((l) => doneMap[l.id]));
  const st = trackStats(p, track);

  const click = (id, state) => {
    if (state === 'locked') { setToast('Termine o passo anterior (lição ou prática) para liberar este.'); setTimeout(() => setToast(''), 2200); return; }
    go(`/t/${track.id}/${id}`);
  };

  return (
    <div className="page path" style={{ '--c': track.color }}>
      <div className="path-head">
        <button className="iconbtn" onClick={() => go('/')} aria-label="Voltar"><Icon name="arrow-left" size={22} /></button>
        <div className="ph-title"><TrackTile icon={track.icon} color={track.color} size={36} /><b>{track.title}</b></div>
        <span className="small muted">{st.done}/{st.total}{st.done < st.total ? ` · ${fmtMin(minutesLeft(track, doneMap))}` : ''}</span>
      </div>
      {track.dataset && (
        <button className="trainbar" onClick={() => go(`/lab/${track.id}`)}>
          <span className="tb-ico lab"><Icon name="lab" size={22} stroke={2.4} /></span>
          <span className="tb-text"><b>Laboratório</b><em>Escreva qualquer SQL no banco da loja, sem exercício</em></span>
          <Icon name="arrow-right" size={20} />
        </button>
      )}
      {st.done > 0 && (
        <button className="trainbar" onClick={() => go(`/t/${track.id}/treino`)}>
          <span className="tb-ico"><Icon name="dumbbell" size={22} stroke={2.4} /></span>
          <span className="tb-text"><b>Treino rápido</b><em>8 exercícios sorteados do que você já aprendeu</em></span>
          <Icon name="arrow-right" size={20} />
        </button>
      )}

      {track.chapters.map((c, ci) => {
        const cdone = c.lessons.filter((l) => doneMap[l.id]).length;
        return (
          <section key={c.id} className="chapter" style={{ '--cc': c.color }}>
            <div className="chbanner">
              <ChapterArt kind={kindFor(c, ci)} />
              <div className="chtext">
                <span className="eyebrow">Capítulo {ci + 1}</span>
                <h2>{c.title}</h2>
                <p>{c.desc}</p>
                <span className="chprog"><i style={{ width: `${(cdone / Math.max(1, c.lessons.length)) * 100}%` }} /></span>
              </div>
            </div>
            <div className="nodes">
              <svg className="trail" aria-hidden="true" />
              {chapterItems(track, c).map((it, li) => {
                const done = doneMap[it.id];
                const state = done ? 'done' : it.id === currentId ? 'current' : 'locked';
                const off = [0, 46, 70, 46, 0, -46, -70, -46][(li + ci * 3) % 8];
                const practice = it.kind === 'practice';
                const icon = state === 'locked' ? 'lock' : practice ? 'dumbbell' : state === 'done' ? (done.perfect ? 'star' : 'check') : it.lesson.icon;
                return (
                  <div key={it.id} className="nodewrap" style={{ transform: `translateX(${off}px)` }}>
                    {state === 'current' && <div className="startbub">{practice ? 'PRÁTICA' : 'COMEÇAR'}</div>}
                    <button className={`node ${practice ? 'practice' : ''} ${state} ${done?.perfect && !practice ? 'perfect' : ''}`} onClick={() => click(it.id, state)} aria-label={practice ? 'Prática' : it.lesson.title}>
                      <Icon name={icon} size={state === 'done' ? 34 : 32} stroke={state === 'done' ? 3 : 2.3} fill={state === 'done' && done.perfect && !practice ? 'currentColor' : undefined} />
                    </button>
                    <div className="nlabel">{practice ? (state === 'done' ? 'Prática (refazer)' : 'Prática obrigatória') : it.lesson.title}</div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {!currentId && (
        <div className="trophy">
          <Burst size={200}><Mascot mood="wow" size={120} /></Burst>
          <h2>Trilha completa!</h2>
          <p className="muted">Você concluiu todas as lições e práticas.</p>
          <button className="btn primary" onClick={() => go(`/t/${track.id}/certificado`)}><Icon name="award" size={18} /> Ver meu certificado</button>
          <button className="btn ghost" onClick={() => go('/criar')}><Icon name="sparkles" size={18} /> Criar nova trilha</button>
        </div>
      )}
      {toast && <div className="toast"><Icon name="lock" size={16} /> {toast}</div>}
    </div>
  );
}

/* ---------- Perfil ---------- */
export function Profile({ tracks, loadTrackFull, go }) {
  const { p, dispatch } = useProgress();
  const [full, setFull] = useState({});
  useEffect(() => { tracks.forEach((t) => loadTrackFull(t.id).then((f) => setFull((s) => ({ ...s, [t.id]: f })))); }, [tracks]);
  const certs = tracks.filter((t) => full[t.id] && trackStats(p, full[t.id]).total > 0 && trackStats(p, full[t.id]).pct === 1);
  const lv = levelOf(p.xp);
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date(Date.now() - (27 - i) * 864e5);
    const k = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return { k, xp: p.days[k] || 0 };
  });
  return (
    <div className="page">
      <div className="profilecard">
        <Mascot size={92} className="bob" />
        <div className="pc-info">
          <span className="eyebrow">Nível {lv.lvl}</span>
          <h1>{p.xp} XP</h1>
          <div className="bar"><i style={{ width: `${(lv.into / lv.need) * 100}%` }} /></div>
          <span className="small">{lv.into}/{lv.need} XP para o nível {lv.lvl + 1}</span>
        </div>
      </div>
      <div className="stats3">
        <div className="stat fire"><Icon name="flame" size={24} fill="currentColor" stroke={1.8} /><b>{liveStreak(p)}</b><span>sequência</span></div>
        <div className="stat gold"><Icon name="zap" size={24} fill="currentColor" stroke={1.8} /><b>{p.xp}</b><span>XP total</span></div>
        <div className="stat green"><Icon name="check" size={24} stroke={3} /><b>{totalDone(p)}</b><span>lições</span></div>
      </div>
      <div className="freezecard">
        <span className="fz-ico"><Icon name="snowflake" size={24} stroke={2.2} /></span>
        <div>
          <b>{p.freezes} {p.freezes === 1 ? "congelamento" : "congelamentos"} de sequência</b>
          <span className="small muted">Cobre um dia perdido sem zerar sua sequência. Você ganha mais um a cada 7 dias seguidos (máx. {MAX_FREEZES}).</span>
        </div>
      </div>
      <h3 className="sec">Últimas 4 semanas</h3>
      <div className="heat">
        {days.map((d) => <i key={d.k} title={p.frozen.includes(d.k) ? `${d.k}: dia congelado` : `${d.k}: ${d.xp} XP`} className={p.frozen.includes(d.k) && d.xp === 0 ? "hf" : `h${d.xp === 0 ? 0 : d.xp < DAILY_GOAL ? 1 : d.xp < DAILY_GOAL * 2 ? 2 : 3}`} />)}
      </div>
      <p className="small muted">Melhor sequência: {p.best} dia(s) · Meta diária: {DAILY_GOAL} XP · quadrados azuis = dias congelados</p>
      <h3 className="sec">Certificados</h3>
      {certs.length === 0 && <p className="small muted">Conclua todas as lições de uma trilha para ganhar o certificado dela.</p>}
      <div className="notelist">
        {certs.map((t) => (
          <button key={t.id} className="trainbar" onClick={() => go(`/t/${t.id}/certificado`)}>
            <span className="tb-ico gold"><Icon name="award" size={22} stroke={2.2} /></span>
            <span className="tb-text"><b>{t.title}</b><em>Ver, baixar ou compartilhar o certificado</em></span>
            <Icon name="arrow-right" size={20} />
          </button>
        ))}
      </div>
      <h3 className="sec">Conquistas</h3>
      <div className="achs">
        {ACHIEVEMENTS.map((a) => {
          const ok = a.ok(p);
          return (
            <div key={a.id} className={`ach ${ok ? 'on' : ''}`}>
              <span className="aicon"><Icon name={ok ? a.icon : 'lock'} size={26} /></span>
              <b>{a.title}</b><span className="small muted">{a.desc}</span>
            </div>
          );
        })}
      </div>
      <h3 className="sec">Ajustes</h3>
      <label className="setting"><span className="row gap"><Icon name={p.sound ? 'volume' : 'mute'} size={20} /> Sons e vibração</span><input type="checkbox" checked={p.sound} onChange={(e) => dispatch({ type: 'sound', on: e.target.checked })} /></label>
      <button className="btn ghost danger-t" onClick={() => confirm('Apagar todo o seu progresso?') && dispatch({ type: 'reset' })}><Icon name="trash" size={18} /> Zerar progresso</button>
    </div>
  );
}

/* ---------- Criar trilha com IA ---------- */
const IDEAS = [['Python para iniciantes', 'code'], ['Inglês para viagem', 'languages'], ['Git e GitHub', 'git'], ['Educação financeira', 'wallet'], ['Excel avançado', 'table'], ['Teoria musical', 'music'], ['Primeiros socorros', 'health']];
export function Create({ go, refresh }) {
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('iniciante');
  const [chapters, setChapters] = useState(4);
  const [job, setJob] = useState(null);
  const [err, setErr] = useState('');

  const start = async () => {
    setErr('');
    try {
      const r = await fetch('/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ topic, level, chapters }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setJob({ id: j.jobId, status: 'outline', progress: 0, message: 'Planejando a trilha…' });
    } catch (e) { setErr(String(e.message || e)); }
  };

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'error') return;
    const t = setInterval(async () => {
      try {
        const j = await (await fetch(`/api/ai/jobs/${job.id}`)).json();
        setJob(j);
        if (j.trackId) refresh();
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [job?.id, job?.status]);

  if (job) {
    const working = job.status !== 'done' && job.status !== 'error';
    return (
      <div className="page center">
        <Burst size={200}><Mascot mood={job.status === 'error' ? 'sad' : job.status === 'done' ? 'wow' : 'think'} size={120} className={working ? 'bob' : ''} /></Burst>
        <h1>{job.status === 'done' ? 'Trilha pronta!' : job.status === 'error' ? 'Algo deu errado' : 'Criando sua trilha…'}</h1>
        {working && (<>
          <div className="bar big"><i style={{ width: `${Math.max(5, job.progress * 100)}%` }} /></div>
          <p className="muted">{job.message}</p>
          {job.trackId && job.progress > 0 && <button className="btn ghost" onClick={() => go(`/t/${job.trackId}`)}>Ver o que já ficou pronto</button>}
          <p className="small muted">Pode levar alguns minutos. Você pode sair desta tela — a geração continua no servidor.</p>
        </>)}
        {job.status === 'done' && <button className="btn primary big" onClick={() => go(`/t/${job.trackId}`)}>Começar a aprender</button>}
        {job.status === 'error' && (<><div className="callout err">{job.error}</div><p className="small muted">A IA usa o Claude Code instalado no servidor. Ele precisa estar logado (rode <code className="ic">claude</code> uma vez no servidor).</p><button className="btn primary" onClick={() => setJob(null)}>Tentar de novo</button></>)}
      </div>
    );
  }

  return (
    <div className="page">
      <div className="herowrap slim">
        <div className="herotext">
          <span className="eyebrow">Powered by IA</span>
          <h1>Crie uma trilha</h1>
          <p>Diga o que quer aprender e a IA monta capítulos, lições e exercícios.</p>
        </div>
        <Mascot mood="think" size={110} className="bob" />
      </div>
      <label className="field"><span>O que você quer aprender?</span>
        <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Ex.: Git e GitHub" maxLength={120} />
      </label>
      <div className="chips">{IDEAS.map(([i, ic]) => <button key={i} className="chip" onClick={() => setTopic(i)}><Icon name={ic} size={16} /> {i}</button>)}</div>
      <div className="field"><span>Seu nível</span>
        <div className="seg">{['iniciante', 'intermediário', 'avançado'].map((l) => <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l}</button>)}</div>
      </div>
      <div className="field"><span>Capítulos: {chapters}</span>
        <input type="range" min="2" max="8" value={chapters} onChange={(e) => setChapters(+e.target.value)} />
      </div>
      {err && <div className="callout err">{err}</div>}
      <button className="btn primary big" disabled={topic.trim().length < 3} onClick={start}><Icon name="wand" size={20} /> Gerar trilha</button>
    </div>
  );
}
