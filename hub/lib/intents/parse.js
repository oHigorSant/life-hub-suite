// Comandos que o app entende NA HORA (sem passar pelo modelo): relógios e navegação.
// Tudo que não casar aqui vai para o agente. Puro (sem dependências) para poder testar.

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[“”"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const UNITS = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19 };
const TENS = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100 };

/** "vinte e cinco" -> "25"; "meia" -> "0.5". Só troca números por extenso; o resto fica igual. */
function wordsToDigits(t) {
  const toks = t.split(" ");
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const w = toks[i];
    if (w === "meia" || w === "meio") { out.push("0.5"); continue; }
    if (w in TENS) {
      let v = TENS[w];
      if (toks[i + 1] === "e" && toks[i + 2] in UNITS && UNITS[toks[i + 2]] < 10) { v += UNITS[toks[i + 2]]; i += 2; }
      out.push(String(v));
      continue;
    }
    if (w in UNITS) { out.push(String(UNITS[w])); continue; }
    out.push(w);
  }
  return out.join(" ");
}

const UNIT_SEC = { h: 3600, hr: 3600, hrs: 3600, hora: 3600, horas: 3600, min: 60, mins: 60, minuto: 60, minutos: 60, m: 60, s: 1, seg: 1, segs: 1, segundo: 1, segundos: 1 };
const DUR_RE = /(\d+(?:\.\d+)?)\s*(horas?|hrs?|h|minutos?|mins?|m|segundos?|segs?|s)\b/g;

/** Duração em segundos a partir de texto livre ("30min", "1h30", "uma hora e meia", "meia hora", "90 segundos"). */
export function parseDuration(text) {
  let t = wordsToDigits(norm(text)).replace(/,/g, ".");
  // "1h30" / "1h 30" -> 1 h + 30 min
  t = t.replace(/(\d+)\s*h\s*(\d{1,2})\b(?!\s*(?:h|horas?|hrs?|segundos?|segs?|s\b))/g, (_m, h, m) => `${h} h ${m} min`);
  // "uma hora e meia" -> "1 hora 0.5 hora"
  t = t.replace(/(\d+(?:\.\d+)?\s*(?:horas?|h))\s*e\s*0\.5\b(?!\s*(?:horas?|h|min|segundos?))/g, "$1 0.5 hora");
  // "meia hora" ja virou "0.5 hora"
  let total = 0;
  let found = false;
  for (const m of t.matchAll(DUR_RE)) {
    const unit = UNIT_SEC[m[2]];
    if (!unit) continue;
    total += parseFloat(m[1]) * unit;
    found = true;
  }
  total = Math.round(total);
  return found && total > 0 && total <= 24 * 3600 ? total : null;
}

export function humanDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (s && !h) parts.push(`${s} s`);
  return parts.join(" ") || "0 s";
}

const ROUTES = [
  { re: /\b(inicio|home|pagina inicial|painel|dashboard)\b/, to: "/", label: "Início" },
  { re: /\b(tarefas?|quadro de tarefas|kanban)\b/, to: "/tarefas", label: "Tarefas" },
  { re: /\b(financas?|financeiro|contas a pagar|minhas contas|faturas?)\b/, to: "/financas", label: "Finanças" },
  { re: /\b(estudos?|atlas|trilhas?|flashcards?)\b/, to: "/estudos", label: "Estudos" },
  { re: /\b(grafo)\b/, to: "/notas/grafo", label: "Grafo" },
  { re: /\b(notas?|anotacoes|cofre)\b/, to: "/notas", label: "Notas" },
  { re: /\b(quadros?|excalidraw|desenhos?|diagramas?)\b/, to: "/quadros", label: "Quadros" },
  { re: /\b(temporizador|timer)\b/, to: "/agenda?v=tempo&t=timer", label: "Temporizador" },
  { re: /\b(pomodoro)\b/, to: "/agenda?v=tempo&t=pomodoro", label: "Pomodoro" },
  { re: /\b(cronometro)\b/, to: "/agenda?v=tempo&t=cronometro", label: "Cronômetro" },
  { re: /\b(relogio|horas|hora)\b/, to: "/agenda?v=tempo&t=relogio", label: "Relógio" },
  { re: /\b(rotina)\b/, to: "/agenda?v=rotina", label: "Rotina" },
  { re: /\b(agenda|calendario|compromissos)\b/, to: "/agenda", label: "Agenda" },
];

const NAV_RE = /^(?:por favor\s+)?(?:abrir|abra|abre|ir para|ir pra|va para|va pra|vai para|vai pra|ve para|me leva para|me leve para|me leva pra|mostrar|mostre|mostra|quero ver|quero abrir|exibir|exiba|navegar para|navegue para)\s+(?:a |o |as |os |na |no |nas |nos |ate |para a |para o |pra a |pra o )?(?:aba |tela |pagina |modulo |area |painel |secao )?(?:de |da |do |das |dos )?(.+)$/;

const TIMER_WORDS = /\b(temporizador|timer|contagem regressiva|alarme|despertador|cronometro regressivo|me avis[ae]|me lembra|me lembre|me chama|me acorda|me desperta|avisa|avise)\b/;
const STOP_WORDS = /\b(parar|pare|pausar|pause|pausa|cancelar|cancele|zerar|zere|resetar|reset|reiniciar|reinicie|desligar|desligue|apagar|apague|encerrar|encerre|finalizar|finalize)\b/;
const PAUSE_WORDS = /\b(pausar|pause|pausa)\b/;
const RESET_WORDS = /\b(zerar|zere|resetar|reset|reiniciar|reinicie|cancelar|cancele|apagar|apague)\b/;

function extractLabel(t) {
  const m = /\b(?:para|pra|pro|por causa d[eao]s?)\s+(.{2,80})$/.exec(t);
  if (!m) return "";
  const label = m[1].replace(/\b(por favor|obrigad[oa])\b/g, "").trim();
  return /^\d/.test(label) ? "" : label;
}

/**
 * Interpreta uma frase. Retorna null (vai para o agente) ou:
 *  { type:"time", kind:"timer"|"stopwatch"|"pomo", action, seconds?, label? }
 *  { type:"navigate", to, label }
 */
export function parseIntent(input) {
  const raw = String(input ?? "").trim();
  if (!raw || raw.length > 160 || raw.includes("\n")) return null;
  const t = norm(raw).replace(/^(oi|ola|ei|claude|por favor|pode|poderia|podia|consegue|quero|preciso|vamos|bora|faz|faca|fazer|crie|criar|inicie|iniciar|inicia|comece|comecar|comeca|comecar a|ligue|ligar|liga|coloque|colocar|coloca|ponha|por|programe|programar|defina|definir|me de|me da)\s+/g, "").trim();
  const t2 = t.replace(/^(um|uma|o|a)\s+/, "");

  // --- navegação ---
  const nav = NAV_RE.exec(norm(raw).replace(/^(oi|ola|ei|claude)\s+/, ""));
  if (nav) {
    // só é navegação se o pedido for APENAS o nome da área; qualquer coisa a mais ("a nota sobre X e resumir") é do agente
    const target = nav[1]
      .replace(/\b(meu|minha|meus|minhas|por favor|agora|ai|ali|pra mim)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    for (const r of ROUTES) {
      const m = r.re.exec(target);
      if (m && m[0] === target) return { type: "navigate", to: r.to, label: r.label };
    }
  }

  const dur = parseDuration(t);
  const hasTimerWord = TIMER_WORDS.test(t);
  const wantsStop = STOP_WORDS.test(t);

  // --- pomodoro ---
  if (/\bpomodoro\b/.test(t) && !dur) {
    // "pausa curta/longa" é um tipo de intervalo, não o comando de pausar
    if (/\b(pausa|intervalo|descanso) curt[ao]\b/.test(t)) return { type: "time", kind: "pomo", action: "start", mode: "short" };
    if (/\b(pausa|intervalo|descanso) long[ao]\b/.test(t)) return { type: "time", kind: "pomo", action: "start", mode: "long" };
    if (PAUSE_WORDS.test(t) || /\b(parar|pare|encerrar|encerre|finalizar|finalize)\b/.test(t)) return { type: "time", kind: "pomo", action: "pause" };
    if (RESET_WORDS.test(t)) return { type: "time", kind: "pomo", action: "reset" };
    if (/\b(pular|pule|proximo|proxima)\b/.test(t)) return { type: "time", kind: "pomo", action: "skip" };
    return { type: "time", kind: "pomo", action: "start", label: extractLabel(t) };
  }

  // --- timer (precisa de duração para iniciar) ---
  if ((hasTimerWord || /^(cronometro|timer)\b/.test(t2)) && dur && !wantsStop) {
    return { type: "time", kind: "timer", action: "start", seconds: dur, label: extractLabel(t.replace(DURLESS, "")) };
  }
  if (/\b(temporizador|timer|alarme|despertador|contagem regressiva)\b/.test(t) && wantsStop) {
    return { type: "time", kind: "timer", action: PAUSE_WORDS.test(t) ? "pause" : "reset" };
  }
  if (/\b(temporizador|timer)\b/.test(t) && /\b(continuar|retomar|retome|continue|resume)\b/.test(t)) return { type: "time", kind: "timer", action: "resume" };

  // --- cronômetro (sem duração) ---
  if (/\bcronometro\b/.test(t) && !dur) {
    if (PAUSE_WORDS.test(t) || /\b(parar|pare|encerrar|encerre)\b/.test(t)) return { type: "time", kind: "stopwatch", action: "pause" };
    if (RESET_WORDS.test(t)) return { type: "time", kind: "stopwatch", action: "reset" };
    if (/\b(volta|marcar|marque|parcial)\b/.test(t)) return { type: "time", kind: "stopwatch", action: "lap" };
    return { type: "time", kind: "stopwatch", action: "start" };
  }

  // "30 minutos" sozinho, ou "em 30 minutos me avisa" — só quando a frase é basicamente a duração
  if (dur && /^(?:em |por |de |daqui a |daqui )?\d+(?:\.\d+)?\s*[a-z]+(?: \d+(?:\.\d+)?\s*[a-z]+)*$/.test(wordsToDigits(t))) {
    return { type: "time", kind: "timer", action: "start", seconds: dur, label: "" };
  }
  return null;
}

// remove o trecho de duração antes de procurar o rótulo ("... de 30min para estudar" -> "... para estudar")
const DURLESS = /(\d+(?:\.\d+)?\s*(?:horas?|hrs?|h|minutos?|mins?|m|segundos?|segs?|s)\b(?:\s*(?:e\s*)?\d+(?:\.\d+)?\s*(?:minutos?|mins?|min|m)\b)?)/g;

/** Resposta curta em português para o que foi feito. */
export function replyFor(intent) {
  if (intent.type === "navigate") return `Abrindo ${intent.label}.`;
  const { kind, action } = intent;
  if (kind === "timer") {
    if (action === "start") return `Temporizador de ${humanDuration(intent.seconds)}${intent.label ? ` (${intent.label})` : ""} iniciado.`;
    if (action === "pause") return "Temporizador pausado.";
    if (action === "resume") return "Temporizador retomado.";
    return "Temporizador zerado.";
  }
  if (kind === "pomo") {
    if (action === "start") return intent.mode === "short" ? "Pausa curta iniciada." : `Pomodoro iniciado${intent.label ? ` (${intent.label})` : ""}.`;
    if (action === "pause") return "Pomodoro pausado.";
    if (action === "skip") return "Pulei para a próxima etapa do pomodoro.";
    return "Pomodoro reiniciado.";
  }
  if (action === "start") return "Cronômetro iniciado.";
  if (action === "pause") return "Cronômetro pausado.";
  if (action === "lap") return "Volta marcada.";
  return "Cronômetro zerado.";
}
