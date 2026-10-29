import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";
import { generateId } from "@/lib/ids";

// Direct write: bare list creation (name only) via the board's "+ Adicionar
// lista" control. Distinct from asking the chat to set up a board with
// several thought-out lists at once — this is just the quick path.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { boardId, name } = body ?? {};
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (typeof boardId !== "string" || !trimmedName) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
  }

  const boardLists = data.lists.filter((l) => l.boardId === boardId);
  const maxOrder = boardLists.reduce((max, l) => Math.max(max, l.order), -1);

  const list = {
    id: generateId("list"),
    boardId,
    name: trimmedName,
    order: maxOrder + 1,
    archived: false,
  };
  data.lists.push(list);

  await writeTasks(data);
  return NextResponse.json({ ok: true, list });
}
