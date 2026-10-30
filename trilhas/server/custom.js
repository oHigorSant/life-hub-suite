// Criação de trilhas por fora do app (agente do Hub): recebe JSON, valida o formato dos passos e as regras
// pedagógicas básicas e grava em tracks-built/. Só os tipos sem execução de código são aceitos
// (read, quiz, fill, order, match). Mensagens de erro são escritas para o agente conseguir se corrigir.
import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ICON_SET } from './generate.js';

const COLORS = ['#7c5cff', '#ff6b9d', '#2bb673', '#ff9f43', '#2d9cdb', '#e0529c'];

// Modelos menores às vezes mandam listas/objetos como texto JSON, ou uma resposta única em vez de lista: aceitamos.
const unJson = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
const asList = (v) => { v = unJson(v); return v == null || Array.isArray(v) ? v : [v]; };

const fail = (msg) => { throw Object.assign(new Error(msg), { status: 400 }); };
const str = (v, max, what) => {
  if (typeof v !== 'string' || !v.trim()) fail(`${what}: texto obrigatório.`);
  if (v.length > max) fail(`${what}: máximo de ${max} caracteres (veio com ${v.length}).`);
  return v.trim();
};
const opt = (v, max, what) => (v == null || v === '' ? undefined : str(v, max, what));
const list = (v, min, max, what) => {
  v = asList(v);
  if (!Array.isArray(v) || v.length < min || v.length > max) fail(`${what}: lista com ${min} a ${max} itens.`);
  return v;
};
const safeIcon = (v, fallback) => (ICON_SET.has(String(v || '').toLowerCase()) ? String(v).toLowerCase() : fallback);

export function cleanStep(s, where) {
  s = unJson(s);
  if (!s || typeof s !== 'object') fail(`${where}: passo inválido.`);
  const w = `${where} (${s.type})`;
  switch (s.type) {
    case 'read':
      return { type: 'read', title: str(s.title, 120, `${w} title`), body: str(s.body, 3000, `${w} body`), ...(opt(s.code, 1500, `${w} code`) ? { code: s.code.trim() } : {}) };
    case 'quiz': {
      const options = list(s.options, 2, 6, `${w} options`).map((o, i) => str(o, 200, `${w} options[${i}]`));
      if (typeof s.answer === 'string') {
        const hit = options.findIndex((o) => o.toLowerCase() === s.answer.trim().toLowerCase());
        s = { ...s, answer: hit >= 0 ? hit : /^\d+$/.test(s.answer.trim()) ? Number(s.answer) : s.answer };
      }
      if (!Number.isInteger(s.answer) || s.answer < 0 || s.answer >= options.length) fail(`${w} answer: use o ÍNDICE (começa em 0) da opção correta, entre 0 e ${options.length - 1}.`);
      return { type: 'quiz', q: str(s.q, 500, `${w} q`), options, answer: s.answer, explain: opt(s.explain, 600, `${w} explain`), ...(opt(s.code, 1500, `${w} code`) ? { code: s.code.trim() } : {}) };
    }
    case 'fill': {
      const code = str(s.code, 1500, `${w} code`);
      const blanks = (code.match(/___/g) || []).length;
      const answer = list(s.answer, 1, 6, `${w} answer`).map((a, i) => str(a, 60, `${w} answer[${i}]`));
      if (blanks !== answer.length) fail(`${w}: o code tem ${blanks} lacuna(s) "___" mas answer tem ${answer.length} peça(s) — precisam ser iguais.`);
      const bank = Array.isArray(s.bank) ? s.bank.map((b, i) => str(b, 60, `${w} bank[${i}]`)) : [];
      for (const a of answer) if (!bank.includes(a)) bank.push(a);
      return { type: 'fill', prompt: str(s.prompt, 500, `${w} prompt`), code, answer, bank, explain: opt(s.explain, 600, `${w} explain`) };
    }
    case 'order':
      return { type: 'order', prompt: str(s.prompt, 500, `${w} prompt`), lines: list(s.lines, 2, 8, `${w} lines`).map((l, i) => str(l, 200, `${w} lines[${i}]`)), explain: opt(s.explain, 600, `${w} explain`) };
    case 'match': {
      const pairs = list(s.pairs, 2, 6, `${w} pairs`).map((p, i) => {
        p = unJson(p);
        if (p && !Array.isArray(p) && typeof p === 'object') p = [p.left ?? p.a ?? p.esquerda ?? Object.values(p)[0], p.right ?? p.b ?? p.direita ?? Object.values(p)[1]];
        if (!Array.isArray(p) || p.length !== 2) fail(`${w} pairs[${i}]: use [esquerda, direita].`);
        return [str(p[0], 80, `${w} pairs[${i}][0]`), str(p[1], 80, `${w} pairs[${i}][1]`)];
      });
      if (new Set(pairs.map((p) => p[0])).size !== pairs.length || new Set(pairs.map((p) => p[1])).size !== pairs.length) fail(`${w}: os itens de cada coluna precisam ser únicos.`);
      return { type: 'match', prompt: str(s.prompt, 500, `${w} prompt`), pairs, explain: opt(s.explain, 600, `${w} explain`) };
    }
    case 'input': {
      const answers = list(s.answers ?? s.answer, 1, 8, `${w} answers`).map((a, i) => str(a, 80, `${w} answers[${i}]`));
      return { type: 'input', prompt: str(s.prompt, 500, `${w} prompt`), answers, placeholder: opt(s.placeholder, 60, `${w} placeholder`), explain: opt(s.explain, 600, `${w} explain`), ...(opt(s.code, 1500, `${w} code`) ? { code: s.code.trim() } : {}) };
    }
    case 'query':
      return fail(`${where}: o tipo "query" (SQL) não é aceito aqui. Use read, quiz, fill, order, match ou input.`);
    default:
      return fail(`${where}: type "${s.type}" inválido. Use read, quiz, fill, order, match ou input.`);
  }
}

export function cleanLesson(l, where, id) {
  if (!l || typeof l !== 'object') fail(`${where}: lição inválida.`);
  l = unJson(l);
  const steps = list(l.steps, 5, 14, `${where} steps`).map((s, i) => cleanStep(s, `${where} passo ${i + 1}`));
  if (steps[0].type !== 'read') fail(`${where}: a lição deve COMEÇAR com um passo "read" — o aluno é ensinado antes de ser cobrado.`);
  if (!steps.some((s) => s.type !== 'read')) fail(`${where}: inclua exercícios (quiz/fill/order/match) depois da explicação.`);
  const firstPractice = steps.findIndex((s) => s.type !== 'read');
  if (firstPractice < 1) fail(`${where}: precisa de pelo menos um "read" antes do primeiro exercício.`);
  return { id, title: str(l.title, 80, `${where} title`), icon: safeIcon(l.icon, 'book'), steps };
}

// ---------------------------------------------------------------- armazenamento
const fileOf = (dir, id) => join(dir, `${id}.json`);
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'trilha';
const save = (dir, t) => { const f = fileOf(dir, t.id); writeFileSync(f + '.tmp', JSON.stringify(t)); renameSync(f + '.tmp', f); };

function buildChapters(chaptersIn, startIndex = 0, usedIds = new Set()) {
  return list(chaptersIn, 1, Infinity, 'chapters').map((c, ci) => {
    c = unJson(c);
    const n = startIndex + ci;
    const cid = `c${n + 1}`;
    const lessons = (asList(c.lessons) || []).slice(0, 12).map((l, li) => {
      let id = `${cid}-l${li + 1}`;
      while (usedIds.has(id)) id += 'x';
      usedIds.add(id);
      return cleanLesson(l, `capítulo ${n + 1} lição ${li + 1}`, id);
    });
    return { id: cid, title: str(c.title, 60, `capítulo ${n + 1} title`), desc: opt(c.desc, 140, `capítulo ${n + 1} desc`) || '', color: COLORS[n % COLORS.length], lessons };
  });
}

export function createTrack(dir, input) {
  const title = str(input?.title, 60, 'title');
  const id = `${slug(title)}-${randomUUID().slice(0, 8)}`;
  const track = {
    id, title, subtitle: opt(input.subtitle, 120, 'subtitle') || '', icon: safeIcon(input.icon, 'sparkles'),
    color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : COLORS[Math.floor(Math.random() * COLORS.length)],
    language: 'text', description: opt(input.description, 300, 'description') || `Trilha criada pelo agente sobre ${title}.`, custom: true, dataset: null,
    chapters: buildChapters(input.chapters),
  };
  save(dir, track);
  return { id, capitulos: track.chapters.length, licoes: track.chapters.reduce((n, c) => n + c.lessons.length, 0) };
}

export function addLessons(dir, id, input) {
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(fileOf(dir, id))) fail('Trilha não encontrada.');
  const track = JSON.parse(readFileSync(fileOf(dir, id), 'utf8'));
  if (!track.custom) fail('Só é possível alterar trilhas criadas por IA/agente (não a trilha de SQL).');
  const used = new Set(track.chapters.flatMap((c) => c.lessons.map((l) => l.id)));

  if (input.new_chapter) {
    const [ch] = buildChapters([{ ...input.new_chapter, lessons: input.lessons }], track.chapters.length, used);
    track.chapters.push(ch);
    save(dir, track);
    return { id, capitulo: track.chapters.length, licoesAdicionadas: ch.lessons.length };
  }
  const ref = input.chapter ?? track.chapters.length;
  const idx = Number.isInteger(ref) ? ref - 1 : track.chapters.findIndex((c) => c.id === ref || c.title.toLowerCase() === String(ref).toLowerCase());
  const ch = track.chapters[idx];
  if (!ch) fail(`Capítulo "${ref}" não existe. A trilha tem ${track.chapters.length} capítulo(s): ${track.chapters.map((c, i) => `${i + 1}=${c.title}`).join('; ')}.`);
  const added = list(input.lessons, 1, 12, 'lessons').map((l, li) => {
    let lid = `${ch.id}-l${ch.lessons.length + li + 1}`;
    while (used.has(lid)) lid += 'x';
    used.add(lid);
    return cleanLesson(l, `lição ${li + 1}`, lid);
  });
  ch.lessons.push(...added);
  save(dir, track);
  return { id, capitulo: idx + 1, licoesAdicionadas: added.length, totalNoCapitulo: ch.lessons.length };
}

export function deleteTrack(dir, id) {
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(fileOf(dir, id))) fail('Trilha não encontrada.');
  const track = JSON.parse(readFileSync(fileOf(dir, id), 'utf8'));
  if (!track.custom) fail('Só é possível apagar trilhas criadas por IA/agente.');
  unlinkSync(fileOf(dir, id));
  return { ok: true };
}

export function updateTrack(dir, id, input) {
  if (!/^[a-z0-9-]+$/.test(id) || !existsSync(fileOf(dir, id))) fail('Trilha não encontrada.');
  const track = JSON.parse(readFileSync(fileOf(dir, id), 'utf8'));
  if (!track.custom) fail('Só é possível editar trilhas criadas por IA/agente.');
  if (input.title != null) track.title = str(input.title, 60, 'title');
  if (input.subtitle != null) track.subtitle = String(input.subtitle).trim().slice(0, 120);
  if (input.icon != null) track.icon = safeIcon(input.icon, track.icon);
  if (Array.isArray(input.chapters)) {
    const oldCh = new Map(track.chapters.map((c) => [c.id, c]));
    const chapters = [];
    for (const cin of input.chapters) {
      const old = oldCh.get(cin?.id);
      if (!old) continue;
      const oldL = new Map(old.lessons.map((l) => [l.id, l]));
      const lessons = [];
      for (const lin of Array.isArray(cin.lessons) ? cin.lessons : []) {
        const ol = oldL.get(lin?.id);
        if (ol) lessons.push({ ...ol, title: str(lin.title ?? ol.title, 80, 'lesson title') });
      }
      chapters.push({ ...old, title: str(cin.title ?? old.title, 80, 'chapter title'), desc: String(cin.desc ?? old.desc ?? '').trim().slice(0, 200), lessons });
    }
    if (!chapters.length) fail('A trilha precisa ter pelo menos um capítulo (para tirar tudo, exclua a trilha).');
    track.chapters = chapters;
  }
  save(dir, track);
  return { ok: true };
}
