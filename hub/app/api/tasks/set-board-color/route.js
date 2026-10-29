import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

const VALID_COLORS = ["blue", "green", "orange", "red", "purple", "pink", "teal", "dark"];

// Direct write: picking a board background is the same "structural,
// low-stakes, reversible" tier as a label/done toggle — not content
// creation, so it doesn't need the chat.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { boardId, color } = body ?? {};
  if (typeof boardId !== "string" || !VALID_COLORS.includes(color)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const board = data.boards.find((b) => b.id === boardId);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado." }, { status: 404 });
  }

  board.color = color;

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
