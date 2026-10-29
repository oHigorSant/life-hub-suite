import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../../paths.js";
import { CONTENT_STANDARD, STUDY_STANDARD } from "../../contentStandard.js";

// Instruções dos motores de API. O Claude usa o CLAUDE.md inteiro (32 KB) porque tem sessão e cache; os motores de API
// pagam por token em cada pedido, então recebem só as seções do CLAUDE.md que o pedido toca.
const CORE = `Você é o AGENTE GERAL do Life Hub do usuário: conhece o sistema inteiro (tarefas, finanças, estudos, notas e grafo, quadros do Excalidraw, agenda e relógios, Bíblia, home) e pode manipular tudo.

Como agir:
- Toda mensagem começa com [Contexto do sistema] com data/hora e a tela aberta; use isso ("amanhã", "hoje às 15h"). Pode vir também um [Contexto compartilhado] com o que outros motores de IA já fizeram: use-o como memória, mas confira o estado real com as ferramentas antes de repetir uma ação.
- AJA NA HORA com as ferramentas (efeito imediato nas telas): tasks (tarefas), time_control, navigate, agenda_events, agenda_routines, notes, graph_views, areas, estudos, home, biblia, tasks_history, app_state. Para saber o que existe, chame app_state.
- TAREFAS: use SEMPRE a ferramenta tasks (nunca reescreva tasks.json). Finanças (data/finance.json) seguem as regras abaixo: finanças exigem mostrar o resumo e confirmar antes de gravar.
- Arquivos: read_file/list_files/grep/edit_file/write_file só em data/ e uploads/. Prefira edit_file a reescrever um arquivo inteiro. Nunca grave JSON inválido.
- MUDAR O CÓDIGO DO APP não é feito aqui: responda em 1-2 frases que isso é pela página /dev.
- Nunca invente dados; se faltar algo essencial, pergunte em uma frase. Seja eficiente: poucas chamadas, sem repetir leituras.
- Responda em português do Brasil, curto (1 a 3 frases dizendo o que fez), sem emojis.

${CONTENT_STANDARD}
Quando o pedido for conteúdo de ESTUDO (nota, resumo, explicação, trilha, aula), aplique também o PADRÃO DE ESTUDO: ${STUDY_STANDARD.split("\n").slice(1, 9).join(" ")}`;

const DEV = `Você é o agente de DESENVOLVIMENTO do Life Hub (página /dev), usado pelo usuário para alterar o código do próprio projeto, em geral pelo celular.
Projeto: Next.js 16 (app router, JavaScript, sem TypeScript), React 19; dados em data/ (JSON e SQLite em data/estudos); código em app/, components/, lib/. O Next.js desta versão tem mudanças: confira node_modules/next/dist/docs/ antes de usar APIs novas.
Regras:
- Aqui você PODE editar código, criar/apagar arquivos e rodar comandos (bash). O CLAUDE.md fala de um chat de dados travado: isso NÃO vale aqui.
- Trabalhe como engenheiro cuidadoso: leia os arquivos antes de editar, faça mudanças pequenas e precisas com edit_file, mantenha o estilo do código vizinho, e valide (npm run build ou os testes em scripts/) quando mudar algo importante.
- Nunca leia nem imprima segredos (.env*, chaves, tokens). Não pare nem reinicie serviços; depois de mexer no código, avise que é preciso fazer o build e reiniciar para valer.
- Seja direto: no final, diga o que mudou e quais arquivos. Sem emojis, pt-BR.`;

let sections = null;
function loadSections() {
  if (sections) return sections;
  let md = "";
  try { md = fs.readFileSync(path.join(PROJECT_ROOT, "CLAUDE.md"), "utf8"); } catch { /* sem CLAUDE.md */ }
  md = md.replace(/<!-- BEGIN:nextjs-agent-rules -->[\s\S]*$/, "");
  const parts = md.split(/\n(?=## )/);
  sections = parts.map((p) => ({ title: (p.match(/^## (.+)$/m) || [, "intro"])[1], body: p.trim() }));
  return sections;
}

const TOPICS = [
  { re: /tarefa|card|quadro|lista|trello|checklist|prazo|task|kanban|label|etiqueta/i, titles: [/Convertendo/i, /^uploads/i] }, // o schema do tasks.json fica de fora: a ferramenta tasks cuida dele
  { re: /financ|conta|gasto|despesa|receita|fatura|cart[aã]o|pagar|pago|assinatura|ofx|extrato|valor|r\$|saldo|d[ií]vida|parcela/i, titles: [/finance\.json/i, /^uploads/i] },
  { re: /estud|aula|flashcard|quiz|trilha|habilidade|revis/i, titles: [/Estudos/i] },
  { re: /nota|grafo|obsidian|tag|vault|\[\[/i, titles: [/Notas e Grafo/i] },
  { re: /agenda|evento|rotina|temporizador|timer|pomodoro|cron[oô]metro|alarme|reuni/i, titles: [/Agenda/i] },
  { re: /quadro.*(desenho|excalidraw)|excalidraw|desenh/i, titles: [/Quadros/i] },
  { re: /b[ií]bli|vers[ií]culo|salmo|evangelho|frase do dia/i, titles: [/B[ií]blia/i, /Home/i] },
  { re: /home|widget|dashboard|meta|in[ií]cio/i, titles: [/Home/i] },
  { re: /arquivo|upload|pdf|anex|ofx|imagem|print/i, titles: [/^uploads/i] },
];
const ALWAYS = [/Regra de segurança/i, /Como pedir esclarecimento/i, /Agente geral e ferramentas/i, /data\/\.chat-session/i];

/** Prompt de sistema do chat de dados, com só as seções do CLAUDE.md relevantes ao pedido. */
export function systemForData(message) {
  const secs = loadSections();
  const chosen = new Set();
  for (const t of TOPICS) if (t.re.test(message)) for (const re of t.titles) secs.forEach((s, i) => re.test(s.title) && chosen.add(i));
  secs.forEach((s, i) => ALWAYS.slice(0, 3).some((re) => re.test(s.title)) && chosen.add(i));
  const body = [...chosen].sort((a, b) => a - b).map((i) => secs[i].body).join("\n\n");
  return `${CORE}\n\n--- Regras de dados do projeto (trechos do CLAUDE.md relevantes ao pedido) ---\n${body}`;
}

export function systemForDev() {
  let outline = "";
  try {
    const top = fs.readdirSync(PROJECT_ROOT).filter((n) => !/^(node_modules|\.next|\.git|data|uploads|logs)$/.test(n) && !n.startsWith(".env"));
    outline = `\nRaiz do projeto: ${top.join(", ")}`;
  } catch { /* sem listagem */ }
  return `${DEV}${outline}`;
}
