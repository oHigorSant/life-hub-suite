// Mentor: tutor de IA com contexto da lição atual, memória de conversa e poder de salvar notas.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runClaude } from './generate.js';
import { createNote } from './notes.js';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'mentor.json');
let history = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const persist = () => {
  history = history.slice(-200);
  writeFileSync(file + '.tmp', JSON.stringify(history));
  renameSync(file + '.tmp', file);
};

export const getHistory = () => history;
export const clearHistory = () => { history = []; persist(); };

const trim = (v, n = 1500) => (v == null ? undefined : String(v).slice(0, n));

function describeContext(c = {}) {
  const s = c.step || {};
  const lines = [];
  if (c.trackTitle) lines.push(`Trilha: ${c.trackTitle}`);
  if (c.chapterTitle) lines.push(`Capítulo: ${c.chapterTitle}`);
  if (c.lessonTitle) lines.push(`Lição: ${c.lessonTitle}${c.stepIndex != null ? ` (passo ${c.stepIndex + 1} de ${c.stepCount})` : ''}`);
  if (!lines.length) lines.push(`Tela: ${c.page || 'início do app'}`);
  if (s.type) {
    lines.push(`Tipo do passo atual: ${s.type}`);
    for (const k of ['title', 'body', 'q', 'prompt', 'code']) if (s[k]) lines.push(`${k}: ${trim(s[k])}`);
    if (s.options) lines.push(`opções: ${s.options.join(' | ')}`);
    if (s.solution) lines.push(`SOLUÇÃO OFICIAL (não entregue pronta a menos que o aluno peça explicitamente ou já tenha desistido): ${trim(s.solution)}`);
  }
  if (c.progress) lines.push(`Progresso do aluno: ${c.progress}`);
  if (c.note) lines.push(`Nota aberta no app: ${trim(c.note.title, 200)}\n${trim(c.note.body)}`);
  if (c.userSql) lines.push(`SQL atual do aluno:\n${trim(c.userSql)}`);
  if (c.lastError) lines.push(`Último erro/feedback: ${trim(c.lastError, 400)}`);
  if (c.schema) lines.push(`Esquema do banco:\n${trim(c.schema, 1200)}`);
  return lines.join('\n');
}

const SYSTEM = `Você é o Mentor do app Trilhas: um tutor paciente, direto e caloroso, em português do Brasil. Fale como um mentor humano experiente, sem emojis.
Regras:
- Responda a dúvida do aluno com clareza e brevidade (normalmente 2 a 6 frases). Use exemplos curtos; código SQL/código em blocos \`\`\`.
- Em exercícios, prefira guiar com perguntas e pistas a entregar a resposta pronta; entregue a resposta só se o aluno pedir ou estiver travado de verdade.
- Use o contexto da lição quando ajudar. Se não houver contexto, converse normalmente sobre aprendizado.
- Salvar notas: crie notas SOMENTE quando o aluno pedir para salvar/anotar/guardar algo, ou pedir um resumo/insight "para as notas". Cada nota deve ser autocontida, útil para reler meses depois (conceito, exemplo de código, armadilha comum), com título curto. Se ele pedir "salva o que você disse" ou "isso", use a conversa recente.
- Se criar nota, confirme brevemente na resposta ("Anotei: <título>").
Formato OBRIGATÓRIO: responda APENAS um JSON válido, sem texto fora dele:
{"reply":"texto da resposta em markdown simples","notes":[{"title":"...","body":"markdown","tags":["tag1","tag2"]}]}
Use "notes": [] quando não for salvar nada.`;

function parse(out) {
  const a = out.indexOf('{'), b = out.lastIndexOf('}');
  if (a >= 0 && b > a) {
    try {
      const j = JSON.parse(out.slice(a, b + 1));
      if (typeof j.reply === 'string') return { reply: j.reply, notes: Array.isArray(j.notes) ? j.notes : [] };
    } catch {}
  }
  return { reply: out.trim(), notes: [] };
}

export async function chat({ message, context }) {
  const msg = trim(message, 4000);
  if (!msg || !msg.trim()) throw new Error('mensagem vazia');
  const recent = history.slice(-12).map((m) => `${m.role === 'user' ? 'Aluno' : 'Mentor'}: ${m.text}`).join('\n');
  const prompt = `${SYSTEM}\n\n=== CONTEXTO ATUAL ===\n${describeContext(context)}\n\n=== CONVERSA RECENTE ===\n${recent || '(início da conversa)'}\n\n=== NOVA MENSAGEM DO ALUNO ===\n${msg}\n\nResponda agora só com o JSON.`;
  const out = await runClaude(prompt, 180000);
  const { reply, notes } = parse(out);

  const source = context?.trackTitle
    ? { trackId: context.trackId, trackTitle: context.trackTitle, chapterTitle: context.chapterTitle, lessonId: context.lessonId, lessonTitle: context.lessonTitle }
    : null;
  const saved = [];
  for (const n of notes.slice(0, 5)) saved.push(await createNote(n, source));

  const now = Date.now();
  history.push({ id: randomUUID().slice(0, 8), role: 'user', text: msg, at: now });
  const mentorMsg = { id: randomUUID().slice(0, 8), role: 'mentor', text: reply, at: Date.now(), notes: saved.map((s) => ({ id: s.id, title: s.title, hub: s.hub?.status })) };
  history.push(mentorMsg);
  persist();
  return { message: mentorMsg, notes: saved };
}
