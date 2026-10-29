import { createContext, useContext, useEffect, useReducer, useRef } from 'react';

export const DAILY_GOAL = 50;
const KEY = 'trilhas:progress:v1';

const dayKey = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};
export const today = () => dayKey();
const yesterday = () => dayKey(new Date(Date.now() - 864e5));

export const MAX_FREEZES = 2;
const empty = () => ({ xp: 0, streak: 0, best: 0, lastDay: null, days: {}, done: {}, lastTrack: null, sound: true, freezes: 1, frozen: [], name: '', updated: 0 });

// Dias de calendário entre duas datas "AAAA-MM-DD".
const diffDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

function load() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return empty();
  }
}

// Sequência: segue viva se o último dia ativo foi hoje/ontem — ou anteontem, havendo um congelamento para cobrir o dia perdido.
export function liveStreak(p) {
  if (!p.lastDay) return 0;
  const gap = diffDays(p.lastDay, today());
  return gap <= 1 || (gap === 2 && p.freezes > 0) ? p.streak : 0;
}

// Avança a sequência ao concluir algo hoje. Um único dia perdido é coberto por um congelamento (ganha-se um a cada 7 dias seguidos, máx. 2).
function advance(s) {
  const t = today();
  if (s.lastDay === t) return { streak: s.streak, freezes: s.freezes, frozen: s.frozen };
  let streak = 1, freezes = s.freezes, frozen = s.frozen;
  if (s.lastDay) {
    const gap = diffDays(s.lastDay, t);
    if (gap === 1) streak = s.streak + 1;
    else if (gap === 2 && freezes > 0) { streak = s.streak + 1; freezes -= 1; frozen = [...frozen, yesterday()]; }
  }
  if (streak > s.streak && streak % 7 === 0) freezes = Math.min(MAX_FREEZES, freezes + 1);
  return { streak, freezes, frozen };
}

export function reducer(s, a) {
  switch (a.type) {
    case 'replace':
      return { ...empty(), ...a.state };
    case 'lastTrack':
      return { ...s, lastTrack: a.id };
    case 'sound':
      return { ...s, sound: a.on, updated: Date.now() };
    case 'complete': {
      const { trackId, lessonId, xp, perfect } = a;
      const t = today();
      const { streak, freezes, frozen } = advance(s);
      const prev = s.done[trackId]?.[lessonId];
      return {
        ...s,
        xp: s.xp + xp,
        streak, freezes, frozen,
        best: Math.max(s.best, streak),
        lastDay: t,
        days: { ...s.days, [t]: (s.days[t] || 0) + xp },
        done: {
          ...s.done,
          [trackId]: { ...s.done[trackId], [lessonId]: { perfect: !!(perfect || prev?.perfect), at: Date.now() } },
        },
        updated: Date.now(),
      };
    }
    case 'practice': {
      // Treino: dá XP e conta para a sequência, mas não marca nenhuma lição como concluída.
      const t = today();
      const { streak, freezes, frozen } = advance(s);
      return { ...s, xp: s.xp + a.xp, streak, freezes, frozen, best: Math.max(s.best, streak), lastDay: t, days: { ...s.days, [t]: (s.days[t] || 0) + a.xp }, updated: Date.now() };
    }
    case 'name':
      return { ...s, name: String(a.name || '').slice(0, 60), updated: Date.now() };
    case 'reset':
      return { ...empty(), updated: Date.now() };
    default:
      return s;
  }
}

const Ctx = createContext(null);
export const useProgress = () => useContext(Ctx);

export function ProgressProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const ready = useRef(false);
  const timer = useRef();

  // Ao abrir, puxa o progresso do servidor e fica com o mais recente.
  useEffect(() => {
    fetch('/api/progress')
      .then((r) => r.json())
      .then((remote) => {
        if (remote && (remote.updated || 0) > (state.updated || 0)) dispatch({ type: 'replace', state: remote });
      })
      .catch(() => {})
      .finally(() => (ready.current = true));
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (!ready.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      fetch('/api/progress', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) }).catch(() => {});
    }, 600);
  }, [state]);

  return <Ctx.Provider value={{ p: state, dispatch }}>{children}</Ctx.Provider>;
}

export function trackStats(p, track) {
  const ids = track.chapters.flatMap((c) => c.lessons.map((l) => l.id));
  const done = ids.filter((id) => p.done[track.id]?.[id]).length;
  return { total: ids.length, done, pct: ids.length ? done / ids.length : 0 };
}

// Tempo restante estimado (como o "eta" por trilha do Mimo): ~20 s por leitura, ~30 s por exercício, ~60 s por SQL.
export function minutesLeft(track, done) {
  let secs = 0;
  for (const c of track.chapters) for (const l of c.lessons) if (!done[l.id]) for (const s of l.steps) secs += s.type === 'read' ? 20 : s.type === 'query' ? 60 : 30;
  return Math.round(secs / 60);
}
export const fmtMin = (m) => (m < 1 ? 'quase lá' : m < 60 ? `~${m} min` : `~${(Math.round(m / 6) / 10).toString().replace('.', ',')} h`);

export const ACHIEVEMENTS = [
  { id: 'first', icon: 'sprout', title: 'Primeiro passo', desc: 'Conclua sua primeira lição', ok: (p) => totalDone(p) >= 1 },
  { id: 'five', icon: 'book', title: 'Pegando o ritmo', desc: 'Conclua 5 lições', ok: (p) => totalDone(p) >= 5 },
  { id: 'twenty', icon: 'rocket', title: 'Decolando', desc: 'Conclua 20 lições', ok: (p) => totalDone(p) >= 20 },
  { id: 'streak3', icon: 'flame', title: 'Pegou fogo', desc: 'Sequência de 3 dias', ok: (p) => p.best >= 3 },
  { id: 'streak7', icon: 'zap', title: 'Uma semana inteira', desc: 'Sequência de 7 dias', ok: (p) => p.best >= 7 },
  { id: 'xp100', icon: 'gem', title: '100 XP', desc: 'Some 100 XP', ok: (p) => p.xp >= 100 },
  { id: 'xp500', icon: 'crown', title: '500 XP', desc: 'Some 500 XP', ok: (p) => p.xp >= 500 },
  { id: 'perfect', icon: 'target', title: 'Sem errar nada', desc: 'Termine uma lição sem erros', ok: (p) => Object.values(p.done).some((t) => Object.values(t).some((l) => l.perfect)) },
];
const totalDone = (p) => Object.values(p.done).reduce((n, t) => n + Object.keys(t).length, 0);
export { totalDone };

export const levelOf = (xp) => {
  let lvl = 1, need = 100, left = xp;
  while (left >= need) { left -= need; lvl++; need = 100 + (lvl - 1) * 50; }
  return { lvl, into: left, need };
};
