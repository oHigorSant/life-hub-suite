// Práticas intercaladas: depois de cada 3 lições de um capítulo (nunca no fim dele) entra uma PRÁTICA obrigatória que
// reforça o que acabou de ser ensinado, sorteando exercícios dessas lições. Sem ela, a próxima lição não libera.
// Depois de concluída, ela pode ser refeita quantas vezes quiser (prática opcional: dá XP, não muda o progresso).
const GROUP = 3;

const shuffleArr = (a) => a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((x) => x[1]);

export function practiceNodes(track) {
  const out = [];
  for (const c of track.chapters) {
    const ls = c.lessons;
    for (let i = GROUP - 1; i < ls.length - 1; i += GROUP) {
      out.push({ id: `p-${c.id}-${(i + 1) / GROUP}`, chapterId: c.id, afterLessonId: ls[i].id, lessons: ls.slice(i - GROUP + 1, i + 1).map((l) => l.id) });
    }
  }
  return out;
}

// Itens de um capítulo na ordem do mapa: lições e, entre elas, as práticas.
export function chapterItems(track, chapter) {
  const nodes = practiceNodes(track).filter((n) => n.chapterId === chapter.id);
  const items = [];
  for (const l of chapter.lessons) {
    items.push({ kind: 'lesson', id: l.id, lesson: l });
    const n = nodes.find((x) => x.afterLessonId === l.id);
    if (n) items.push({ kind: 'practice', id: n.id, node: n });
  }
  return items;
}

export const sequenceOf = (track) => track.chapters.flatMap((c) => chapterItems(track, c).map((i) => i.id));

export function buildPractice(track, node, mark) {
  const byId = new Map(track.chapters.flatMap((c) => c.lessons.map((l) => [l.id, l])));
  const picked = node.lessons
    .map((id) => byId.get(id))
    .filter(Boolean)
    .flatMap((l) => shuffleArr(l.steps.filter((s) => s.type !== 'read')).slice(0, 3));
  const steps = shuffleArr(picked).slice(0, 8);
  return steps.length ? { id: node.id, title: 'Prática', icon: 'dumbbell', practice: true, mark, steps } : false;
}
