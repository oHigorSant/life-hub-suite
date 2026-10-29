import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";
import { generateId, nowIso } from "@/lib/ids";

// Direct write: bare card creation (title only) via a list's quick-add
// input. This is the "fast literal entry" path, same as Trello's own
// per-list quick-add. The chat remains the richer path — description,
// checklist, labels, due dates inferred from messy input.
// `index` (opcional): insere NO MEIO da lista, nessa posição (0 = topo); sem ele vai para o fim.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { listId, title, index } = body ?? {};
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (typeof listId !== "string" || !trimmedTitle) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const list = data.lists.find((l) => l.id === listId);
  if (!list) {
    return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
  }

  const now = nowIso();
  const card = {
    id: generateId("card"),
    boardId: list.boardId,
    listId,
    title: trimmedTitle,
    description: "",
    order: 0,
    labelIds: [],
    dueDate: null,
    startDate: null,
    done: false,
    completedAt: null,
    cover: null,
    checklist: [],
    recurrence: { freq: "none", days: [], lastGeneratedDate: null },
    archived: false,
    createdAt: now,
    updatedAt: now,
  };

  const listCards = data.cards
    .filter((c) => c.listId === listId && !c.archived)
    .sort((a, b) => a.order - b.order);
  const at = typeof index === "number" ? Math.max(0, Math.min(index, listCards.length)) : listCards.length;
  listCards.splice(at, 0, card);
  listCards.forEach((c, i) => {
    c.order = i;
  });
  data.cards.push(card);

  await writeTasks(data);
  return NextResponse.json({ ok: true, card });
}
