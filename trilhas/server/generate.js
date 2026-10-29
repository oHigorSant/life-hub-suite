// Geração de trilhas e dicas por IA usando o Claude Code CLI (`claude -p`) instalado na máquina.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const CLAUDE = process.env.CLAUDE_BIN || 'claude';
const jobs = new Map();

// Nomes válidos em src/icons.jsx (a IA escolhe um; qualquer outro valor cai no padrão).
const ICON_LIST = 'brain search target calculator layers type calendar blocks dice window eye puzzle link chart package filter ruler sigma database table key code pencil globe music shield clock graduation star scale languages dumbbell landmark palette terminal git wallet chef atom boxes network list-ordered rocket book flag heart cpu camera leaf coffee plane health sprout bulb trophy';
export const ICON_SET = new Set(ICON_LIST.split(' '));
const safeIcon = (v, fallback) => (ICON_SET.has(String(v || '').toLowerCase()) ? String(v).toLowerCase() : fallback);

export function runClaude(prompt, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    // Sem ferramentas e sem sessão salva: o modelo só escreve texto, nunca mexe na máquina.
    const args = ['-p', '--output-format', 'text'];
    if (process.platform !== 'win32') args.push('--tools', '', '--no-session-persistence');
    const p = spawn(CLAUDE, args, { shell: process.platform === 'win32' });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error('tempo esgotado')); }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `claude saiu com código ${code}`));
    });
    p.stdin.end(prompt);
  });
}

export async function claudeAvailable() {
  try { await runClaude('Responda apenas: ok', 60000); return true; } catch { return false; }
}

function extractJson(text) {
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0 || b < 0) throw new Error('resposta sem JSON');
  return JSON.parse(text.slice(a, b + 1));
}

const STEP_SPEC = `Tipos de passo permitidos (JSON):
{"type":"read","title":"...","body":"texto curto; use **negrito** e \`código\`","code":"opcional"}
{"type":"quiz","q":"...","options":["..",".."],"answer":0,"explain":"...","code":"opcional"}
{"type":"fill","prompt":"...","code":"trecho com ___ nas lacunas","answer":["peça1"],"bank":["peça1","distratora"],"explain":"..."}
{"type":"order","prompt":"...","lines":["linhas JÁ na ordem correta"],"explain":"..."}
{"type":"match","prompt":"...","pairs":[["a","b"],["c","d"]],"explain":"..."}
{"type":"input","prompt":"...","answers":["resposta aceita","variação aceita"],"explain":"..."}  (o aluno DIGITA uma resposta curta; liste todas as variações aceitas; use só depois de ensinar o termo)`;

export function startGeneration({ topic, level, chapters, builtDir }) {
  const jobId = randomUUID().slice(0, 8);
  const job = { id: jobId, status: 'outline', progress: 0, message: 'Planejando a trilha…', trackId: null, error: null };
  jobs.set(jobId, job);

  (async () => {
    try {
      const outline = extractJson(await runClaude(
        `Você é um designer instrucional criando um curso interativo curto no estilo Mimo/Duolingo, em português do Brasil.
Tema: "${topic}". Nível: ${level}. Crie ${chapters} capítulos, cada um com 3 a 4 lições, em ordem didática progressiva.
Os campos "icon" NÃO são emojis: use exatamente UM destes nomes de ícone: ${ICON_LIST}.
Responda SOMENTE com JSON: {"title":"nome curto","subtitle":"frase curta","icon":"nome-do-icone","language":"texto","chapters":[{"title":"..","desc":"..","lessons":[{"title":"..","icon":"nome-do-icone","goal":"o que o aluno aprende"}]}]}`));
      const slug = topic.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'curso';
      const trackId = `${slug}-${jobId}`;
      const colors = ['#7c5cff', '#ff6b9d', '#2bb673', '#ff9f43', '#2d9cdb', '#e0529c'];
      const track = {
        id: trackId, title: outline.title, subtitle: outline.subtitle, icon: safeIcon(outline.icon, 'sparkles'), color: colors[Math.floor(Math.random() * colors.length)],
        language: outline.language || 'text', description: `Trilha gerada por IA sobre ${topic}.`, custom: true, generating: true, dataset: null,
        chapters: outline.chapters.map((c, ci) => ({ id: `c${ci + 1}`, title: c.title, desc: c.desc, color: colors[ci % colors.length], lessons: [] })),
      };
      const save = () => writeFileSync(join(builtDir, `${trackId}.json`), JSON.stringify(track));
      job.trackId = trackId;
      save();

      const total = outline.chapters.reduce((n, c) => n + c.lessons.length, 0);
      let done = 0;
      const taughtSoFar = [];
      job.status = 'lessons';
      for (let ci = 0; ci < outline.chapters.length; ci++) {
        const ch = outline.chapters[ci];
        for (let li = 0; li < ch.lessons.length; li++) {
          const l = ch.lessons[li];
          job.message = `Escrevendo: ${l.title}`;
          let steps = null;
          for (let attempt = 0; attempt < 2 && !steps; attempt++) {
            try {
              const r = extractJson(await runClaude(
                `Lições anteriores já ensinadas: ${taughtSoFar.join('; ') || '(nenhuma, é a primeira)'}.
Escreva UMA lição interativa em português do Brasil sobre "${l.title}" (${l.goal}) do curso "${outline.title}", capítulo "${ch.title}", nível ${level}.
REGRA PEDAGÓGICA INEGOCIÁVEL: o aluno é ENSINADO ANTES DE SER COBRADO. Todo termo, comando ou ideia usada num quiz/fill/order/match precisa ter sido explicado antes, num "read" desta mesma lição ou das lições anteriores (listadas abaixo), em linguagem simples e com exemplo. Ritmo: 2 "read" curtos (conceito + exemplo) -> 1 passo de reconhecimento fácil -> prática guiada -> prática mais livre, dificuldade sempre crescente; no máximo 3 ideias novas por lição. Entre 7 e 9 passos. Textos curtos e amigáveis, sem emojis. Respostas corretas devem ser inequívocas.
${STEP_SPEC}
Responda SOMENTE com JSON: {"steps":[...]}`));
              if (Array.isArray(r.steps) && r.steps.length >= 4) steps = r.steps;
            } catch (e) { if (attempt) throw e; }
          }
          track.chapters[ci].lessons.push({ id: `c${ci + 1}-l${li + 1}`, title: l.title, icon: safeIcon(l.icon, 'book'), steps });
          taughtSoFar.push(`${l.title} (${l.goal})`);
          done++;
          job.progress = done / total;
          save();
        }
      }
      delete track.generating;
      save();
      job.status = 'done';
      job.message = 'Pronto!';
    } catch (e) {
      job.status = 'error';
      job.error = String(e.message || e);
    }
  })();

  return jobId;
}

export const getJob = (id) => jobs.get(id);

export async function aiHint({ prompt, sql, error, schema }) {
  return runClaude(
    `Você é um tutor de SQL gentil. O aluno está resolvendo este exercício: "${prompt}".
Esquema do banco:\n${schema || '(não informado)'}\nSQL atual do aluno:\n${sql || '(vazio)'}\n${error ? `Erro: ${error}\n` : ''}
Dê UMA dica curta (máx. 2 frases) em português que o oriente sem entregar a resposta pronta.`, 90000);
}
