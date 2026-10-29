import { useCallback, useEffect, useRef, useState } from 'react';
import { STEP_COMPONENTS } from './steps.jsx';
import { Confetti, Code, RichText, beep } from './ui.jsx';
import { Mascot, Burst } from './art.jsx';
import { Icon } from './icons.jsx';
import { useMentor, MentorButton } from './mentor.jsx';
import { useProgress, DAILY_GOAL, today } from './store.jsx';

const PRAISE = ['Boa!', 'Mandou bem!', 'Isso aí!', 'Perfeito!', 'Arrasou!', 'Exato!'];
const RETRY = ['Quase lá!', 'Não foi dessa vez.', 'Tente de novo!', 'Ops, confira de novo.'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export default function Lesson({ track, chapter, lesson, nextLesson, onExit, onNext }) {
  const { p, dispatch } = useProgress();
  const steps = lesson.steps;
  const [idx, setIdx] = useState(0);
  const [reg, setReg] = useState({ ready: false });
  const [phase, setPhase] = useState('answer'); // answer | checking | ok | bad
  const [detail, setDetail] = useState('');
  const [tries, setTries] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [firstTry, setFirstTry] = useState(0);
  const [xp, setXp] = useState(0);
  const [msg, setMsg] = useState('');
  const [finished, setFinished] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const scroller = useRef();
  const startFreezes = useRef(p.freezes);
  const mentor = useMentor();

  const step = steps[idx];
  const Comp = STEP_COMPONENTS[step?.type];
  const interactive = step && step.type !== 'read';

  const register = useCallback((r) => setReg(r), []);

  // O Mentor sabe em que passo o aluno está (a SOLUÇÃO vai junto, mas ele é instruído a não entregá-la).
  useEffect(() => {
    const s = steps[idx];
    mentor.setBase({
      page: 'lição', trackId: track.id, trackTitle: track.title, chapterTitle: chapter.title, lessonId: lesson.id, lessonTitle: lesson.title,
      stepIndex: idx, stepCount: steps.length,
      step: { type: s.type, title: s.title, body: s.body, q: s.q, prompt: s.prompt, code: s.code, options: s.options, solution: s.solution },
    });
  }, [idx]);
  useEffect(() => { if (phase === 'bad') mentor.patch({ lastError: detail || 'resposta incorreta' }); }, [phase, detail]);

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); setPhase('answer'); setDetail(''); setTries(0); }, [idx]);

  const markOk = (retries) => {
    const gain = retries === 0 ? 10 : 5;
    setXp((x) => x + gain);
    if (retries === 0) setFirstTry((f) => f + 1);
    setMsg(pick(PRAISE));
    setPhase('ok');
    beep('ok', p.sound);
  };

  // Passos "match" concluem sozinhos quando tudo foi ligado.
  useEffect(() => {
    if (step?.type === 'match' && reg.auto && reg.ready && phase === 'answer') markOk(tries);
  }, [reg, phase]);

  const onMistake = () => { setMistakes((m) => m + 1); setTries((t) => t + 1); beep('bad', p.sound); };

  const next = () => {
    if (idx + 1 >= steps.length) return finish();
    setIdx(idx + 1);
  };

  const finish = () => {
    const interactiveCount = steps.filter((s) => s.type !== 'read').length;
    const perfect = mistakes === 0;
    const bonus = (lesson.practice ? 10 : 20) + (perfect ? 10 : 0);
    if (lesson.practice && !lesson.mark) dispatch({ type: 'practice', xp: xp + bonus });
    else dispatch({ type: 'complete', trackId: track.id, lessonId: lesson.id, xp: xp + bonus, perfect });
    setXp((x) => x + bonus);
    setFinished({ perfect, accuracy: interactiveCount ? Math.round((firstTry / interactiveCount) * 100) : 100, bonus });
    beep('win', p.sound);
  };

  const press = async () => {
    if (phase === 'ok') return next();
    if (phase === 'bad') { setPhase('answer'); return; }
    if (phase !== 'answer' || !reg.ready) return;
    if (!interactive) { if (reg.reveal?.()) return; return next(); }
    setPhase('checking');
    let r;
    try { r = await reg.check(); } catch (e) { r = { ok: false, detail: String(e.message || e) }; }
    if (r.ok) return markOk(tries);
    setMistakes((m) => m + 1);
    setTries((t) => t + 1);
    setDetail(r.detail || '');
    setMsg(pick(RETRY));
    setPhase('bad');
    beep('bad', p.sound);
  };

  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !['TEXTAREA', 'BUTTON', 'SUMMARY'].includes(e.target.tagName)) { e.preventDefault(); pressRef.current(); }
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, []);

  if (finished) {
    const doneToday = p.days[today()] || 0;
    return (
      <div className="lesson finish">
        <Confetti />
        <div className="finish-body">
          <Burst size={230}><Mascot mood="wow" size={130} className="bob" /></Burst>
          <h1>{finished.perfect ? 'Lição perfeita!' : 'Lição concluída!'}</h1>
          <p className="muted">{lesson.title}</p>
          <div className="stats3">
            <div className="stat gold"><Icon name="zap" size={24} fill="currentColor" stroke={1.8} /><b>+{xp}</b><span>XP</span></div>
            <div className="stat green"><Icon name="target" size={24} stroke={2.4} /><b>{finished.accuracy}%</b><span>de primeira</span></div>
            <div className="stat fire"><Icon name="flame" size={24} fill="currentColor" stroke={1.8} /><b>{p.streak}</b><span>dia(s) seguidos</span></div>
          </div>
          {p.freezes < startFreezes.current && <div className="freeze-note"><Icon name="snowflake" size={18} /> Um congelamento cobriu o dia que você perdeu: sua sequência continua.</div>}
          {p.freezes > startFreezes.current && <div className="freeze-note"><Icon name="snowflake" size={18} /> Você ganhou um congelamento de sequência!</div>}
          <div className="goal">
            <div className="goal-top"><span>Meta diária</span><span>{Math.min(doneToday, DAILY_GOAL)}/{DAILY_GOAL} XP</span></div>
            <div className="bar"><i style={{ width: `${Math.min(100, (doneToday / DAILY_GOAL) * 100)}%` }} /></div>
          </div>
        </div>
        <div className="actionbar ok">
          <div className="actioninner">
            {nextLesson ? <button className="btn primary big" onClick={onNext}>Próxima lição <Icon name="arrow-right" size={20} stroke={3} /></button> : <button className="btn primary big" onClick={onExit}>Concluir</button>}
            {nextLesson && <button className="btn ghost" onClick={onExit}>Voltar à trilha</button>}
          </div>
        </div>
      </div>
    );
  }

  const label = phase === 'ok' ? 'Continuar' : phase === 'bad' ? 'Tentar de novo' : phase === 'checking' ? 'Verificando…' : interactive ? 'Verificar' : 'Continuar';
  const disabled = phase === 'checking' || (phase === 'answer' && !reg.ready) || (step.type === 'match' && phase === 'answer');
  const locked = phase === 'ok' || phase === 'checking';
  const verdict = phase === 'ok' ? 'ok' : phase === 'bad' ? 'bad' : null;

  return (
    <div className="lesson" style={{ '--accent': chapter.color }}>
      <header className="lhead">
        <button className="iconbtn" aria-label="Sair" onClick={() => (idx === 0 && phase === 'answer' ? onExit() : setConfirmExit(true))}><Icon name="x" size={24} stroke={2.8} /></button>
        <div className="bar big"><i style={{ width: `${((idx + (phase === 'ok' ? 1 : 0)) / steps.length) * 100}%` }} /></div>
        <MentorButton />
        <div className="xpchip"><Icon name="zap" size={18} fill="currentColor" stroke={1.8} />{xp}</div>
      </header>

      <main className="lbody" ref={scroller}>
        <div className="lcontent">
          <Comp key={idx} step={step} track={track} chapter={chapter} first={idx === 0} register={register} verdict={verdict} locked={locked} onMistake={onMistake} />
          {phase === 'bad' && tries >= 3 && step.type === 'query' && (
            <details className="callout"><summary>Ver uma solução</summary><Code code={step.solution} /></details>
          )}
        </div>
      </main>

      <footer className={`actionbar ${phase === 'ok' ? 'ok' : phase === 'bad' ? 'bad' : ''}`}>
        <div className="actioninner">
          {(phase === 'ok' || phase === 'bad') && (
            <div className="feedback">
              <Mascot mood={phase === 'ok' ? 'happy' : 'sad'} size={56} />
              <div>
                <b>{msg}</b>
                {phase === 'bad' && detail && <div className="fb-detail">{detail}</div>}
                {phase === 'ok' && step.explain && <RichText text={step.explain} className="fb-detail" />}
              </div>
            </div>
          )}
          <button className={`btn big ${phase === 'bad' ? 'danger' : 'primary'}`} disabled={disabled} onClick={press}>{label}</button>
        </div>
      </footer>

      {confirmExit && (
        <div className="modal" onClick={() => setConfirmExit(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <Mascot mood="sad" size={80} />
            <h3>Quer mesmo sair?</h3>
            <p className="muted">Você vai perder o progresso desta lição.</p>
            <button className="btn primary big" onClick={() => setConfirmExit(false)}>Continuar aprendendo</button>
            <button className="btn ghost" onClick={onExit}>Sair da lição</button>
          </div>
        </div>
      )}
    </div>
  );
}
