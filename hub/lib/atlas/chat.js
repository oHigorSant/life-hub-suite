import { db, now, parse } from "./db.js";
import { askJson } from "./llm.js";
import { search } from "./kb.js";
import { computeTree, computeGaps, subjectSummary } from "./progress.js";
import { generateRoadmap } from "./roadmap.js";
import { generateActivity } from "./activities.js";

const SYSTEM = `Você é o mentor do aluno dentro de um app de estudos que organiza áreas do conhecimento em árvores de habilidades. Fale em pt-BR, direto, preciso e exigente: sem bajulação, sem floreio, sem preâmbulo; responda ao cerne da pergunta e acrescente só o que um especialista acrescentaria (exceção, armadilha, fonte canônica).
Você tem: a árvore da área (nós com status e domínio), pontos de atenção do aluno e trechos do material dele (busca). Use o material para responder com precisão e cite [fonte localizador]. Se a pergunta fugir do material, responda com conhecimento sólido e diga que não veio do material.
Você também pode AGIR. Devolva "actions" quando o aluno pedir ou quando for claramente útil:
- {"type":"extend_roadmap","prompt":"o que adicionar à árvore (tema, profundidade, carga horária)"}
- {"type":"quiz","node_id":"n_...","focus":"o que cobrir","count":10}
- {"type":"flashcards","node_id":"n_..."}
- {"type":"lesson"|"exercise"|"podcast"|"reading"|"project","node_id":"n_..."}
Só use node_id que exista na árvore fornecida. Não prometa ações que não estejam em "actions".`;

export async function chat(subjectId, message) {
  const subject = db().prepare("SELECT * FROM subjects WHERE id=?").get(subjectId);
  db().prepare("INSERT INTO chat(subject_id, role, content, created_at) VALUES (?,?,?,?)").run(subjectId, "user", message, now());
  const history = db().prepare("SELECT role, content FROM chat WHERE subject_id=? ORDER BY id DESC LIMIT 12").all(subjectId).reverse().slice(0, -1);
  const { nodes } = computeTree(subjectId);
  const hits = search(subjectId, message, { limit: 6 });
  const gaps = computeGaps(subjectId);
  const sum = subjectSummary(subjectId);

  const treeText = nodes.map((n) => `${n.id} | ${n.title} | ${n.branch} | tier ${n.tier} | ${n.status} | domínio ${Math.round(n.mastery * 100)}%`).join("\n");
  const ctx = `ÁREA: ${subject.title}\nOBJETIVO: ${subject.goal || ""}\nPROGRESSO: ${sum.percent}% (${sum.mastered}/${sum.nodes} nós dominados), ${sum.due} cartões vencidos\n\nÁRVORE:\n${treeText || "(vazia)"}\n\nPONTOS DE ATENÇÃO:\n` +
    `${gaps.weakConcepts.map((c) => `- conceito fraco: ${c.title}`).join("\n")}\n${gaps.misconceptions.map((m) => `- equívoco recorrente: ${m.misconception}`).join("\n")}\n\n` +
    `TRECHOS RELEVANTES DO MATERIAL:\n${hits.chunks.map((c) => `[${c.source} ${c.locator}] ${c.text.slice(0, 900)}`).join("\n\n") || "(nada encontrado)"}`;

  const r = await askJson({
    system: SYSTEM,
    prompt: `${ctx}\n\nCONVERSA RECENTE:\n${history.map((m) => `${m.role === "user" ? "Aluno" : "Mentor"}: ${m.content}`).join("\n")}\n\nAluno: ${message}\n\nJSON: {"reply":"markdown","actions":[]}`,
    timeoutMs: 600_000,
  });

  const jobs = [];
  const valid = new Set(nodes.map((n) => n.id));
  for (const a of r.actions || []) {
    try {
      if (a.type === "extend_roadmap") jobs.push({ kind: "Expandindo a árvore", id: generateRoadmap(subjectId, { extend: true, prompt: a.prompt || message }) });
      else if (valid.has(a.node_id) && ["quiz", "flashcards", "lesson", "exercise", "podcast", "reading", "project"].includes(a.type))
        jobs.push({ kind: `Gerando ${a.type}`, node_id: a.node_id, id: generateActivity(a.node_id, a.type, { focus: a.focus, count: a.count }) });
    } catch (e) {
      console.error("[chat action]", e);
    }
  }
  const reply = r.reply || "(sem resposta)";
  db().prepare("INSERT INTO chat(subject_id, role, content, created_at) VALUES (?,?,?,?)").run(subjectId, "assistant", reply, now());
  return { reply, jobs };
}
