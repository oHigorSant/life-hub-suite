import fs from "node:fs";
import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { TASKS_FILE, FINANCE_FILE } from "../paths.js";
import { emit, uiCommand } from "../live/bus.js";
import { readAgenda, upsertEvent, deleteEvent, upsertRoutine, deleteRoutine } from "../agenda/store.js";
import { timeAction } from "../agenda/timers.js";
import { loadNotes, readNote, writeNote, deleteNote, renameNote, searchNotes, readViews, writeViews, readAreas, writeAreas, ensureAreaPath, sanitizeAreas } from "../notas/store.js";
import { sanitizeView } from "../notas/views.js";
import { listBoards } from "../quadros/store.js";
import { passage as biblePassage, verseOfTheDay, books as bibleBooks, DEFAULT_VERSION } from "../biblia/yv.js";
import { readTasks, writeTasks } from "../tasksStore.js";
import { generateId, nowIso } from "../ids.js";
import { readHome, WIDGETS, setWidget, saveLayout, upsertGoal, deleteGoal, setPhrase } from "../home/store.js";

// Ferramentas do agente geral: cada uma chama direto o código do app (efeito imediato, sem passar por arquivo),
// emite o evento em tempo real e devolve um resultado curto para o modelo confirmar ao usuário.
const text = (obj) => ({ content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj) }] });
const fail = (msg) => ({ content: [{ type: "text", text: String(msg) }], isError: true });
const safe = (fn) => async (args) => {
  try { return text(await fn(args ?? {})); } catch (e) { return fail(e?.message || e); }
};
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } };
const today = () => new Date().toLocaleDateString("sv-SE");

export const ROUTES = ["/", "/tarefas", "/financas", "/estudos", "/biblia", "/motores", "/notas", "/notas/grafo", "/quadros", "/trilhas", "/agenda", "/agenda?v=tempo", "/agenda?v=tempo&t=timer", "/agenda?v=tempo&t=pomodoro", "/agenda?v=tempo&t=cronometro", "/agenda?v=tempo&t=relogio", "/agenda?v=rotina", "/agenda?v=semana", "/agenda?v=mes"];

function agoraLocal() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full", timeStyle: "medium" });
}

// ------------------------------------------------------------------ estado geral
async function appState() {
  const d = today();
  const t = readJson(TASKS_FILE, { boards: [], lists: [], cards: [] });
  const open = (t.cards || []).filter((c) => !c.archived && !c.done);
  const fin = readJson(FINANCE_FILE, { bills: [], accounts: [] });
  const openBills = (fin.bills || []).filter((b) => !b.archived && b.status !== "paid");
  const in7 = new Date(Date.now() + 7 * 864e5).toLocaleDateString("sv-SE");
  const ag = readAgenda();
  const notes = loadNotes();
  const tagCount = new Map();
  for (const n of notes) for (const x of n.tags) tagCount.set(x, (tagCount.get(x) || 0) + 1);

  let estudos = { areas: [], cartoesParaRevisar: 0 };
  try {
    const { db } = await import("../atlas/db.js");
    const { subjectSummary, todayPlan } = await import("../atlas/progress.js");
    const rows = db().prepare("SELECT * FROM subjects WHERE status!='archived' ORDER BY updated_at DESC").all();
    estudos = {
      areas: rows.map((s) => {
        const sum = subjectSummary(s.id);
        const plan = todayPlan(s.id);
        return { id: s.id, titulo: s.title, objetivo: s.goal, progressoPct: sum.percent, habilidades: sum.nodes, dominadas: sum.mastered, cartoesVencidos: sum.due, hoje: (plan.picks || []).slice(0, 4).map((p) => p.title) };
      }),
      cartoesParaRevisar: db().prepare("SELECT COUNT(*) n FROM cards WHERE due<=?").get(Date.now()).n,
    };
  } catch (e) { estudos.erro = String(e.message || e); }

  return {
    agora: agoraLocal(),
    hoje: d,
    tarefas: {
      abertas: open.length,
      atrasadas: open.filter((c) => c.dueDate && c.dueDate < d).length,
      paraHoje: open.filter((c) => c.dueDate === d).slice(0, 12).map((c) => c.title),
      quadros: (t.boards || []).filter((b) => !b.archived).map((b) => ({ id: b.id, nome: b.name })),
    },
    financas: {
      contas: (fin.accounts || []).filter((a) => !a.archived).map((a) => ({ id: a.id, nome: a.name, tipo: a.type })),
      emAbertoTotal: Math.round(openBills.reduce((s, b) => s + b.amount, 0) * 100) / 100,
      atrasadoTotal: Math.round(openBills.filter((b) => b.dueDate < d || b.status === "overdue").reduce((s, b) => s + b.amount, 0) * 100) / 100,
      vencemEm7Dias: openBills.filter((b) => b.dueDate >= d && b.dueDate <= in7).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 12).map((b) => ({ nome: b.name, valor: b.amount, vencimento: b.dueDate })),
    },
    estudos,
    notas: { total: notes.length, areas: readAreas().map((a) => a.id), tagsMaisUsadas: [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}(${v})`), visoesDoGrafo: readViews().views.map((v) => v.name) },
    agenda: {
      eventosHoje: ag.events.filter((e) => e.date === d || (e.endDate && e.date <= d && d <= e.endDate)).map((e) => ({ id: e.id, titulo: e.title, horario: e.allDay ? "dia todo" : `${e.startTime}-${e.endTime}` })),
      rotinasAtivas: ag.routines.filter((r) => r.active).map((r) => ({ id: r.id, titulo: r.title, horario: r.time, dias: r.days })),
      temporizador: ag.timer, cronometro: ag.stopwatch, pomodoro: ag.pomo,
    },
    quadros: listBoards().map((b) => b.name),
  };
}

// ------------------------------------------------------------------ Trilhas (app de aprendizado gamificado)
const TRILHAS_URL = process.env.TRILHAS_URL || "http://127.0.0.1:4300";
async function trilhasApi(method, p, body) {
  const r = await fetch(`${TRILHAS_URL}${p}`, {
    method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(60000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `O app Trilhas respondeu ${r.status}.`);
  return j;
}
const TRILHAS_STEPS = `REGRAS PEDAGÓGICAS (obrigatórias, o servidor recusa o que as viola): o aluno é ENSINADO ANTES DE SER COBRADO e o conteúdo é GRADUAL. Cada lição: (1) começa com 1-2 passos "read" (conceito em linguagem simples + exemplo); (2) um passo de reconhecimento fácil (quiz ou match); (3) prática guiada (fill ou order); (4) prática um pouco mais livre; no máximo 3 ideias novas por lição; só cobra o que já foi explicado num "read" da própria lição ou de lições anteriores; 5 a 14 passos (ideal 7-9). Capítulos em ordem didática crescente. Português do Brasil, sem emojis, textos curtos e amigáveis.
FORMATO DOS PASSOS (JSON): {"type":"read","title":"...","body":"texto; **negrito** e \`código\`","code":"opcional"} | {"type":"quiz","q":"...","options":["..",".."],"answer":0 (ÍNDICE da certa),"explain":"...","code":"opcional"} | {"type":"fill","prompt":"...","code":"trecho com ___ nas lacunas","answer":["peça"],"bank":["peça","distratora"],"explain":"..."} | {"type":"order","prompt":"...","lines":["linhas JÁ NA ORDEM CERTA"],"explain":"..."} | {"type":"match","prompt":"...","pairs":[["a","b"],["c","d"]],"explain":"..."} | {"type":"input","prompt":"...","answers":["resposta aceita","variação aceita"],"explain":"..."} (o aluno DIGITA uma resposta curta; liste todas as variações aceitas; só use depois de ensinar o termo). Respostas corretas inequívocas e independentes de opinião.
LIÇÃO: {"title":"...","icon":"nome de ícone","steps":[...]}. Ícones válidos: brain search target calculator layers type calendar blocks dice window eye puzzle link chart package filter ruler sigma database table key code pencil globe music shield clock graduation star scale languages dumbbell landmark palette terminal git wallet chef atom boxes network list-ordered rocket book flag heart cpu camera leaf coffee plane health sprout bulb trophy.`;
// ------------------------------------------------------------------ definições
const KIND = { timer: "timer", pomodoro: "pomo", cronometro: "stopwatch" };

export function buildHubServer() {
  const tools = [
    tool("app_state", "Resumo do estado ATUAL de todo o sistema (data/hora, tarefas, finanças, estudos, notas, agenda, relógios, quadros). Use antes de responder perguntas sobre o que há no app ou para decidir o que fazer.", {}, safe(appState)),

    tool(
      "tasks_history",
      "Consulta o HISTÓRICO de tarefas (inclui concluídas e arquivadas) para responder perguntas como 'liste as tarefas do trabalho que fiz do dia X ao dia Y'. Somente leitura. Filtros (todos opcionais): board e list (nome parcial), status done|open|all, archived true|false|all, createdFrom/createdTo, completedFrom/completedTo (AAAA-MM-DD), text, label, limit (padrão 100). Cada resultado traz datas de criação, conclusão e arquivamento.",
      {
        board: z.string().optional(), list: z.string().optional(),
        status: z.enum(["done", "open", "all"]).optional(), archived: z.enum(["true", "false", "all"]).optional(),
        createdFrom: z.string().optional(), createdTo: z.string().optional(),
        completedFrom: z.string().optional(), completedTo: z.string().optional(),
        text: z.string().optional(), label: z.string().optional(), limit: z.number().int().positive().max(500).optional(),
      },
      safe(async (a) => {
        const t = readJson(TASKS_FILE, { boards: [], lists: [], labels: [], cards: [] });
        const boards = new Map((t.boards || []).map((b) => [b.id, b]));
        const lists = new Map((t.lists || []).map((l) => [l.id, l]));
        const labels = new Map((t.labels || []).map((l) => [l.id, l]));
        const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        const day = (iso) => (iso ? String(iso).slice(0, 10) : null);
        const inRange = (iso, from, to) => { const d = day(iso); if (!from && !to) return true; if (!d) return false; return (!from || d >= from) && (!to || d <= to); };
        const rows = [];
        for (const c of t.cards || []) {
          const done = !!c.done;
          const completedAt = done ? c.completedAt || c.updatedAt || null : null;
          const b = boards.get(c.boardId);
          const l = lists.get(c.listId);
          if (a.board && !norm(b?.name).includes(norm(a.board))) continue;
          if (a.list && !norm(l?.name).includes(norm(a.list))) continue;
          if ((a.status === "done" && !done) || (a.status === "open" && done)) continue;
          const arch = a.archived ?? "all";
          if ((arch === "true" && !c.archived) || (arch === "false" && c.archived)) continue;
          if (!inRange(c.createdAt, a.createdFrom, a.createdTo)) continue;
          if ((a.completedFrom || a.completedTo) && !inRange(completedAt, a.completedFrom, a.completedTo)) continue;
          if (a.text && !norm(`${c.title} ${c.description}`).includes(norm(a.text))) continue;
          const names = (c.labelIds || []).map((id) => labels.get(id)?.name).filter(Boolean);
          if (a.label && !names.some((n) => norm(n).includes(norm(a.label)))) continue;
          rows.push({ titulo: c.title, quadro: b?.name, lista: l?.name, concluida: done, concluidaEm: completedAt, criadaEm: c.createdAt, arquivada: !!c.archived, arquivadaEm: c.archivedAt || null, prazo: c.dueDate, labels: names, id: c.id });
        }
        rows.sort((x, y) => String(y.concluidaEm || y.criadaEm).localeCompare(String(x.concluidaEm || x.criadaEm)));
        const porQuadro = {};
        for (const r of rows) porQuadro[r.quadro] = (porQuadro[r.quadro] || 0) + 1;
        return { total: rows.length, porQuadro, tarefas: rows.slice(0, a.limit ?? 100) };
      })
    ),

    tool(
      "time_control",
      "Controla temporizador, pomodoro e cronômetro do app, NA HORA. Ex.: temporizador de 30 min => kind=timer, action=start, minutes=30. Telas abertas atualizam sozinhas.",
      {
        kind: z.enum(["timer", "pomodoro", "cronometro"]),
        action: z.enum(["start", "pause", "resume", "reset", "stop", "skip", "lap", "mode"]),
        minutes: z.number().positive().max(1440).optional().describe("duração do temporizador em minutos"),
        seconds: z.number().positive().max(86400).optional(),
        label: z.string().max(120).optional().describe("rótulo (ex.: o que vai fazer)"),
        mode: z.enum(["focus", "short", "long"]).optional().describe("modo do pomodoro"),
      },
      safe(async (a) => {
        const secs = a.seconds ?? (a.minutes != null ? Math.round(a.minutes * 60) : undefined);
        const r = await timeAction(KIND[a.kind], a.action, { seconds: secs, label: a.label, mode: a.mode });
        const pick = a.kind === "timer" ? r.timer : a.kind === "pomodoro" ? r.pomo : r.stopwatch;
        return { ok: true, estado: pick };
      })
    ),

    tool(
      "navigate",
      "Abre uma tela do app para o usuário, na hora. Rotas: " + ROUTES.join(", ") + ". Também aceita /notas?n=<caminho.md> e /notas/grafo?foco=<caminho.md>.",
      { to: z.string().max(300) },
      safe(async ({ to }) => {
        const ok = ROUTES.includes(to) || /^\/biblia\?r=[1-3A-Z]{3}\.\d+$/.test(to) || /^\/notas\?n=[^\s]+$/.test(to) || /^\/notas\/grafo\?foco=[^\s]+$/.test(to);
        if (!ok) throw new Error(`Rota não permitida. Use uma de: ${ROUTES.join(", ")}`);
        uiCommand("navigate", { to });
        return { ok: true, aberto: to };
      })
    ),

    tool(
      "tasks",
      "Tarefas (quadros Kanban). action: boards (quadros e listas com seus nomes) | list (cards abertos; filtros board, list, text, status open|done|all, limit) | add (board, list, title, description?, dueDate?, startDate?, checklist?[], labels?[]; para várias tarefas chame várias vezes) | update (id, title?, description?, dueDate?, startDate?, checklist?[]) | done (id, done=true|false) | move (id, list, board?) | archive (id). Board/list por nome parcial (sem acento/maiúscula). Datas AAAA-MM-DD. Prefira esta ferramenta a editar tasks.json à mão.",
      {
        action: z.enum(["boards", "list", "add", "update", "done", "move", "archive"]),
        id: z.string().optional(), board: z.string().optional(), list: z.string().optional(),
        title: z.string().optional(), description: z.string().optional(),
        dueDate: z.string().nullable().optional(), startDate: z.string().nullable().optional(),
        checklist: z.array(z.string()).optional(), labels: z.array(z.string()).optional(),
        done: z.boolean().optional(), text: z.string().optional(), status: z.enum(["open", "done", "all"]).optional(), limit: z.number().optional(),
      },
      safe(async (a) => {
        const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
        const data = await readTasks();
        const boards = data.boards.filter((b) => !b.archived);
        const pickBoard = (name) => {
          if (!name) { if (boards.length === 1) return boards[0]; throw new Error(`Informe o quadro. Opções: ${boards.map((b) => b.name).join(", ")}`); }
          const exact = boards.filter((b) => norm(b.name) === norm(name));
          const hit = exact.length ? exact : boards.filter((b) => norm(b.name).includes(norm(name)));
          if (hit.length !== 1) throw new Error(hit.length ? `Quadro ambíguo "${name}": ${hit.map((b) => b.name).join(", ")}` : `Quadro "${name}" não encontrado. Opções: ${boards.map((b) => b.name).join(", ")}`);
          return hit[0];
        };
        const listsOf = (b) => data.lists.filter((l) => l.boardId === b.id && !l.archived).sort((x, y) => x.order - y.order);
        const pickList = (b, name) => {
          const ls = listsOf(b);
          if (!name) return ls[0];
          const exact = ls.filter((l) => norm(l.name) === norm(name));
          const hit = exact.length ? exact : ls.filter((l) => norm(l.name).includes(norm(name)));
          if (hit.length !== 1) throw new Error(hit.length ? `Lista ambígua "${name}": ${hit.map((l) => l.name).join(", ")}` : `Lista "${name}" não encontrada em "${b.name}". Opções: ${ls.map((l) => l.name).join(", ")}`);
          return hit[0];
        };
        const findCard = (id) => { const c = data.cards.find((x) => x.id === id && !x.archived); if (!c) throw new Error("Card não encontrado (use list para ver os ids)."); return c; };
        const card = (c) => ({ id: c.id, title: c.title, board: data.boards.find((b) => b.id === c.boardId)?.name, list: data.lists.find((l) => l.id === c.listId)?.name, due: c.dueDate, done: c.done, checklist: (c.checklist || []).map((i) => `${i.done ? "[x]" : "[ ]"} ${i.text}`) });
        const ymd = (v) => (v == null ? null : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : (() => { throw new Error("Data inválida: use AAAA-MM-DD."); })());
        const reorder = (listId) => data.cards.filter((c) => c.listId === listId && !c.archived).sort((x, y) => x.order - y.order).forEach((c, i) => { c.order = i; });
        const now = nowIso();

        if (a.action === "boards") return boards.map((b) => ({ board: b.name, listas: listsOf(b).map((l) => l.name), labels: data.labels.filter((x) => x.boardId === b.id).map((x) => x.name) }));
        if (a.action === "list") {
          let cs = data.cards.filter((c) => !c.archived);
          if (a.board) { const b = pickBoard(a.board); cs = cs.filter((c) => c.boardId === b.id); if (a.list) { const l = pickList(b, a.list); cs = cs.filter((c) => c.listId === l.id); } }
          const st = a.status || "open";
          if (st !== "all") cs = cs.filter((c) => (st === "done" ? c.done : !c.done));
          if (a.text) cs = cs.filter((c) => norm(`${c.title} ${c.description}`).includes(norm(a.text)));
          return cs.sort((x, y) => (x.dueDate || "9999").localeCompare(y.dueDate || "9999")).slice(0, a.limit || 30).map(card);
        }
        if (a.action === "add") {
          if (!a.title?.trim()) throw new Error("Informe o título.");
          const b = pickBoard(a.board), l = pickList(b, a.list);
          const lbls = []; const miss = [];
          for (const n of a.labels || []) { const x = data.labels.find((y) => y.boardId === b.id && norm(y.name) === norm(n)); x ? lbls.push(x.id) : miss.push(n); }
          const c = { id: generateId("card"), boardId: b.id, listId: l.id, title: a.title.trim(), description: a.description || "", order: 1e9, labelIds: lbls, dueDate: ymd(a.dueDate), startDate: ymd(a.startDate), done: false, completedAt: null, cover: null, checklist: (a.checklist || []).map((t) => ({ id: generateId("item"), text: t, done: false })), recurrence: { freq: "none", days: [], lastGeneratedDate: null }, archived: false, createdAt: now, updatedAt: now };
          data.cards.push(c); reorder(l.id); await writeTasks(data);
          return { ok: true, criado: card(c), labelsInexistentes: miss.length ? miss : undefined };
        }
        const c = findCard(a.id);
        if (a.action === "update") {
          if (a.title != null) c.title = a.title.trim() || c.title;
          if (a.description != null) c.description = a.description;
          if (a.dueDate !== undefined) c.dueDate = ymd(a.dueDate);
          if (a.startDate !== undefined) c.startDate = ymd(a.startDate);
          if (a.checklist) c.checklist = a.checklist.map((t) => ({ id: generateId("item"), text: t, done: false }));
          c.updatedAt = now; await writeTasks(data); return { ok: true, card: card(c) };
        }
        if (a.action === "done") {
          c.done = a.done !== false; c.completedAt = c.done ? now : null; c.updatedAt = now; await writeTasks(data); return { ok: true, card: card(c) };
        }
        if (a.action === "move") {
          const b = a.board ? pickBoard(a.board) : data.boards.find((x) => x.id === c.boardId);
          const l = pickList(b, a.list);
          const from = c.listId; c.boardId = b.id; c.listId = l.id; c.order = 1e9; c.updatedAt = now; reorder(from); reorder(l.id);
          await writeTasks(data); return { ok: true, card: card(c) };
        }
        if (a.action === "archive") { c.archived = true; c.archivedAt = now; c.updatedAt = now; await writeTasks(data); return { ok: true, arquivado: c.title }; }
      })
    ),

    tool(
      "biblia",
      "Bíblia (YouVersion, versão BLT em português). action: passage (ref em USFM, ex.: JHN.3, JHN.3.16-18, PSA.23) devolve o texto; votd (versículo do dia); books (livros e ids USFM); open (abre o leitor na tela, ref = JHN.3). Para a frase do dia, leia a passagem e grave a síntese com a ferramenta home (phrase_set).",
      { action: z.enum(["passage", "votd", "books", "open"]), ref: z.string().optional() },
      safe(async (a) => {
        if (a.action === "votd") return await verseOfTheDay(DEFAULT_VERSION);
        if (a.action === "books") return (await bibleBooks(DEFAULT_VERSION)).map((b) => `${b.id}=${b.title}(${b.chapters})`).join(", ");
        if (!a.ref) throw new Error("Informe ref (USFM), ex.: JHN.3.16");
        if (a.action === "open") { uiCommand("navigate", { to: `/biblia?r=${a.ref}` }); return { ok: true, aberto: a.ref }; }
        const p = await biblePassage(DEFAULT_VERSION, a.ref);
        return { referencia: p.reference, texto: p.text, versao: "BLT" };
      })
    ),

    tool(
      "home",
      "Home (dashboard). Widgets: " + WIDGETS.map((w) => `${w.id} (${w.label})`).join(", ") + ". action: get (layout, metas, frase); show/hide (id); order (ids na ordem desejada); goal_set (title, progress 0-100, note, due AAAA-MM-DD, id para editar); goal_delete (id); phrase_set (text, ref) — a 'frase ensinamento do dia', sintetizada por você a partir do estudo bíblico (use a ferramenta estudos para ler o conteúdo).",
      {
        action: z.enum(["get", "show", "hide", "order", "goal_set", "goal_delete", "phrase_set"]),
        id: z.string().optional(), ids: z.array(z.string()).optional(),
        title: z.string().optional(), progress: z.number().optional(), note: z.string().optional(), due: z.string().optional(),
        text: z.string().optional(), ref: z.string().optional(),
      },
      safe(async (a) => {
        switch (a.action) {
          case "get": { const h = readHome(); return { layout: h.layout, metas: h.goals, fraseDoDia: h.phrase }; }
          case "show": case "hide": await setWidget(a.id, a.action === "show"); return { ok: true, id: a.id, visivel: a.action === "show" };
          case "order": {
            const cur = readHome().layout;
            const first = (a.ids || []).map((id) => cur.find((l) => l.id === id)).filter(Boolean);
            await saveLayout([...first, ...cur.filter((l) => !first.includes(l))]);
            return { ok: true };
          }
          case "goal_set": return { ok: true, metas: (await upsertGoal({ id: a.id, title: a.title, progress: a.progress, note: a.note, due: a.due })).goals };
          case "goal_delete": await deleteGoal(a.id); return { ok: true };
          case "phrase_set": await setPhrase(a.text, a.ref); return { ok: true };
        }
      })
    ),

    tool(
      "agenda_events",
      "Eventos do calendário. list (de/até AAAA-MM-DD), create, update (precisa id), delete (precisa id). Data AAAA-MM-DD, horas HH:MM.",
      {
        action: z.enum(["list", "create", "update", "delete"]),
        id: z.string().optional(),
        title: z.string().optional(), date: z.string().optional(), endDate: z.string().optional(),
        startTime: z.string().optional(), endTime: z.string().optional(), allDay: z.boolean().optional(),
        color: z.enum(["blue", "green", "red", "orange", "purple", "teal", "pink", "grey"]).optional(),
        notes: z.string().optional(), location: z.string().optional(), done: z.boolean().optional(),
        from: z.string().optional(), to: z.string().optional(),
      },
      safe(async (a) => {
        if (a.action === "list") {
          const from = a.from || today();
          const to = a.to || from;
          return readAgenda().events.filter((e) => (e.endDate || e.date) >= from && e.date <= to).sort((x, y) => (x.date + (x.startTime || "")).localeCompare(y.date + (y.startTime || "")));
        }
        if (a.action === "delete") return deleteEvent(String(a.id));
        const base = a.action === "update" ? readAgenda().events.find((e) => e.id === a.id) : {};
        if (a.action === "update" && !base) throw new Error("Evento não encontrado.");
        const { action, from, to, ...fields } = a;
        return upsertEvent({ ...base, ...fields });
      })
    ),

    tool(
      "agenda_routines",
      "Rotina semanal (hábitos fixos). list, create, update (id), delete (id). days: 0=domingo..6=sábado. time HH:MM, duration em minutos.",
      {
        action: z.enum(["list", "create", "update", "delete"]),
        id: z.string().optional(), title: z.string().optional(), time: z.string().optional(),
        duration: z.number().optional(), days: z.array(z.number().int().min(0).max(6)).optional(),
        color: z.enum(["blue", "green", "red", "orange", "purple", "teal", "pink", "grey"]).optional(),
        active: z.boolean().optional(), notes: z.string().optional(),
      },
      safe(async (a) => {
        if (a.action === "list") return readAgenda().routines;
        if (a.action === "delete") return deleteRoutine(String(a.id));
        const base = a.action === "update" ? readAgenda().routines.find((r) => r.id === a.id) : {};
        if (a.action === "update" && !base) throw new Error("Rotina não encontrada.");
        const { action, ...fields } = a;
        return upsertRoutine({ ...base, ...fields });
      })
    ),

    tool(
      "notes",
      "Cofre de notas em markdown (data/notas). write cria/sobrescreve a nota inteira (path como 'Pasta/Nome.md'; frontmatter opcional: tipo, area: 'Pai > Filha > Neta', tags: [a, b]); append acrescenta ao fim; read; list; search; delete (vai para a lixeira); rename. Links: [[Nota]], menções @Nota, tags #tag.",
      {
        action: z.enum(["list", "read", "write", "append", "search", "delete", "rename"]),
        path: z.string().optional(), content: z.string().optional(), query: z.string().optional(), to: z.string().optional(),
      },
      safe(async (a) => {
        switch (a.action) {
          case "list": return loadNotes().map((n) => ({ path: n.path, titulo: n.title, tipo: n.type, area: n.area, tags: n.tags }));
          case "read": return readNote(a.path).raw;
          case "search": return searchNotes(a.query || "");
          case "write": { const r = writeNote(a.path, a.content ?? ""); emit("notas"); return { ok: true, path: r.path }; }
          case "append": {
            let cur = "";
            try { cur = readNote(a.path).raw; } catch {}
            const r = writeNote(a.path, cur + (cur && !cur.endsWith("\n") ? "\n" : "") + (a.content ?? ""));
            emit("notas");
            return { ok: true, path: r.path };
          }
          case "delete": deleteNote(a.path); emit("notas"); return { ok: true };
          case "rename": { const r = renameNote(a.path, a.to); emit("notas"); return r; }
          default: throw new Error("Ação inválida.");
        }
      })
    ),

    tool(
      "graph_views",
      "Visões salvas do grafo de notas (como views de SQL: filtro + agrupamento + estilo + regras). list; save (cria/atualiza pelo id); delete (id); activate (id). Campos de view: id, name, description, filter{areas[],includeDescendants,tags[],tagMode any|all,types[],text,focus,depth,hideOrphans,hideGhosts}, show{links,mentions,tags,hierarchy,labels}, group none|area|tag, style{nodeColorBy area|tag|type|fixed,nodeShapeBy none|type|area,sizeBy fixed|degree|words,fixedColor,edgeColor,background}, rules[{when{area|tag|type|text|minDegree},set{color,shape,icon,size,border}}], layout fcose|cose|concentric|breadthfirst|circle|grid. Formas: ellipse round-rectangle rectangle diamond hexagon octagon star triangle pentagon tag round-tag vee barrel. Ícones: file-text server cpu database globe code terminal shield book star flag folder layers zap cloud lock bug brain. Depois de salvar, use activate e navigate para /notas/grafo se o usuário quiser ver.",
      { action: z.enum(["list", "save", "delete", "activate"]), id: z.string().optional(), view: z.record(z.string(), z.any()).optional() },
      safe(async (a) => {
        const cur = readViews();
        if (a.action === "list") return cur;
        if (a.action === "activate") { const r = writeViews({ views: cur.views, activeId: a.id }); emit("notas"); return { ok: true, ativa: r.activeId }; }
        if (a.action === "delete") {
          const views = cur.views.filter((v) => v.id !== a.id);
          if (!views.length) throw new Error("É preciso manter ao menos uma visão.");
          writeViews({ views, activeId: views[0].id });
          emit("notas");
          return { ok: true };
        }
        const v = sanitizeView(a.view || {});
        const exists = cur.views.some((x) => x.id === v.id);
        const r = writeViews({ views: exists ? cur.views.map((x) => (x.id === v.id ? v : x)) : [...cur.views, v], activeId: v.id });
        emit("notas");
        return { ok: true, visao: r.views.find((x) => x.id === v.id) };
      })
    ),

    tool(
      "areas",
      "Hierarquia de áreas das notas (ex.: Computação > Sistemas Operacionais > Windows). list; upsert cria os níveis que faltarem e ajusta aparência (color #rrggbb, border solid|dashed|dotted|double, shape, icon). As notas se ligam a uma área pelo campo 'area:' no frontmatter.",
      {
        action: z.enum(["list", "upsert"]),
        areas: z.array(z.object({ path: z.string(), color: z.string().optional(), border: z.string().optional(), shape: z.string().optional(), icon: z.string().optional() })).optional(),
      },
      safe(async (a) => {
        const areas = readAreas();
        if (a.action === "list") return areas;
        for (const it of a.areas || []) {
          const { id } = ensureAreaPath(areas, it.path);
          const x = areas.find((y) => y.id === id);
          if (x) {
            if (it.color) x.color = it.color;
            if (it.border) x.border = it.border;
            if (it.shape) x.shape = it.shape;
            if (it.icon) x.icon = it.icon;
          }
        }
        const clean = sanitizeAreas(areas);
        writeAreas(clean);
        emit("notas");
        return { ok: true, areas: clean.map((x) => x.id) };
      })
    ),

    tool(
      "estudos",
      "Módulo Estudos (trilhas de habilidades com flashcards, quiz e podcast). overview (áreas, progresso, plano de hoje, cartões); due_cards (cartões vencidos, opcional subjectId); create_subject (title obrigatório; goal, start_level, target_level, hours_per_week, deadline AAAA-MM-DD); build_roadmap (subjectId; prompt opcional; extend=true complementa) — gera a árvore em segundo plano e devolve o id do job.",
      {
        action: z.enum(["overview", "due_cards", "create_subject", "build_roadmap"]),
        subjectId: z.string().optional(), title: z.string().optional(), goal: z.string().optional(),
        start_level: z.string().optional(), target_level: z.string().optional(), hours_per_week: z.number().optional(),
        deadline: z.string().optional(), prompt: z.string().optional(), extend: z.boolean().optional(),
      },
      safe(async (a) => {
        const { db, now, uid, logEvent } = await import("../atlas/db.js");
        const { subjectSummary, todayPlan } = await import("../atlas/progress.js");
        if (a.action === "overview") {
          return db().prepare("SELECT * FROM subjects WHERE status!='archived' ORDER BY updated_at DESC").all().map((s) => ({ id: s.id, titulo: s.title, objetivo: s.goal, resumo: subjectSummary(s.id), hoje: todayPlan(s.id) }));
        }
        if (a.action === "due_cards") {
          const rows = db().prepare(`SELECT c.id, c.front, s.title AS area FROM cards c JOIN subjects s ON s.id=c.subject_id WHERE c.due<=? ${a.subjectId ? "AND c.subject_id=?" : ""} ORDER BY c.due LIMIT 30`).all(...[now(), ...(a.subjectId ? [a.subjectId] : [])]);
          return rows;
        }
        if (a.action === "create_subject") {
          if (!a.title?.trim()) throw new Error("Informe o título da área.");
          const COLORS = ["#8b5cf6", "#22d3ee", "#f59e0b", "#34d399", "#f472b6", "#60a5fa", "#fb7185", "#a3e635"];
          const id = uid("sub_");
          const n = db().prepare("SELECT COUNT(*) n FROM subjects").get().n;
          db().prepare("INSERT INTO subjects(id, title, goal, start_level, target_level, deadline, hours_per_week, color, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
            .run(id, a.title.trim(), a.goal || null, a.start_level || null, a.target_level || null, a.deadline || null, a.hours_per_week ? Number(a.hours_per_week) : null, COLORS[n % COLORS.length], now(), now());
          logEvent(id, "subject_created", id, { title: a.title });
          emit("estudos");
          return { ok: true, subjectId: id, dica: "Chame build_roadmap com esse subjectId para gerar a árvore de habilidades." };
        }
        if (a.action === "build_roadmap") {
          const { generateRoadmap } = await import("../atlas/roadmap.js");
          if (!a.subjectId) throw new Error("Informe o subjectId.");
          const job = generateRoadmap(a.subjectId, { extend: !!a.extend, prompt: a.prompt || "" });
          emit("estudos");
          return { ok: true, job, aviso: "A árvore está sendo gerada em segundo plano; o progresso aparece em Estudos." };
        }
        throw new Error("Ação inválida.");
      })
    ),
    tool(
      "trilhas",
      "App TRILHAS (aprendizado gamificado estilo Mimo/Duolingo; tela /trilhas). Ações: list (trilhas e progresso); generate (topic, level iniciante|intermediário|avançado, chapters 2-8: a IA do próprio app escreve a trilha toda em segundo plano — use para pedidos simples e rápidos; devolve jobId, acompanhe com job_status); create (title, subtitle, icon, color #rrggbb, chapters[{title, desc, lessons[]}] — VOCÊ escreve o conteúdo; para trilhas grandes crie com 1-2 lições por capítulo e complete com add_lessons em lotes de até 3 lições); add_lessons (trackId, chapter = número 1-based OU título do capítulo existente, ou new_chapter {title, desc}, lessons[]); delete (trackId; só trilhas criadas por IA/agente). Depois de criar, diga ao usuário que a trilha está em Trilhas (navigate /trilhas). " + TRILHAS_STEPS,
      {
        action: z.enum(["list", "generate", "job_status", "create", "add_lessons", "delete"]),
        topic: z.string().optional(), level: z.string().optional(), chapters: z.any().optional(), jobId: z.string().optional(),
        title: z.string().optional(), subtitle: z.string().optional(), icon: z.string().optional(), color: z.string().optional(), description: z.string().optional(),
        trackId: z.string().optional(), chapter: z.union([z.number(), z.string()]).optional(), new_chapter: z.any().optional(), lessons: z.any().optional(),
      },
      safe(async (a) => {
        if (a.action === "list") {
          const [tracks, p] = await Promise.all([trilhasApi("GET", "/api/tracks"), trilhasApi("GET", "/api/progress").catch(() => null)]);
          return tracks.map((t) => {
            const lessons = t.chapters.flatMap((c) => c.lessons);
            return { id: t.id, titulo: t.title, capitulos: t.chapters.length, licoes: lessons.length, concluidas: lessons.filter((l) => p?.done?.[t.id]?.[l]).length, criadaPorIA: !!t.custom, gerando: !!t.generating };
          });
        }
        if (a.action === "generate") {
          if (!a.topic?.trim()) throw new Error("Informe o topic (assunto da trilha).");
          const r = await trilhasApi("POST", "/api/ai/generate", { topic: a.topic, level: a.level || "iniciante", chapters: typeof a.chapters === "number" ? a.chapters : 4 });
          emit("trilhas");
          return { ok: true, jobId: r.jobId, aviso: "A trilha está sendo escrita em segundo plano (alguns minutos). Use job_status com esse jobId para acompanhar." };
        }
        if (a.action === "job_status") {
          if (!a.jobId) throw new Error("Informe o jobId.");
          return trilhasApi("GET", `/api/ai/jobs/${encodeURIComponent(a.jobId)}`);
        }
        if (a.action === "create") {
          const r = await trilhasApi("POST", "/api/tracks", { title: a.title, subtitle: a.subtitle, icon: a.icon, color: a.color, description: a.description, chapters: a.chapters });
          emit("trilhas");
          return { ok: true, ...r, dica: "Use add_lessons para acrescentar mais lições e navigate /trilhas para abrir." };
        }
        if (a.action === "add_lessons") {
          if (!a.trackId) throw new Error("Informe o trackId.");
          const r = await trilhasApi("POST", `/api/tracks/${encodeURIComponent(a.trackId)}/lessons`, { chapter: a.chapter, new_chapter: a.new_chapter, lessons: a.lessons });
          emit("trilhas");
          return { ok: true, ...r };
        }
        if (a.action === "delete") {
          if (!a.trackId) throw new Error("Informe o trackId.");
          const r = await trilhasApi("DELETE", `/api/tracks/${encodeURIComponent(a.trackId)}`);
          emit("trilhas");
          return r;
        }
        throw new Error("Ação inválida.");
      })
    ),
  ];

  return { server: createSdkMcpServer({ name: "hub", version: "1.0.0", tools }), toolNames: tools.map((t) => `mcp__hub__${t.name}`), tools };
}
