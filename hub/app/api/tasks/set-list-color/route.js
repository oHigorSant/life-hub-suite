import { NextResponse } from "next/server";
import { readTasks, writeTasks } from "@/lib/tasksStore";

const VALID_COLORS = [
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
  "sky",
  "lime",
  "pink",
  "black",
  "grey",
];

// Direct write: a colored accent stripe on the list header, purely visual —
// same label color palette used for labels/covers, for one consistent set
// of names across the app. `color: null` clears it back to neutral.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { listId, color } = body ?? {};
  if (typeof listId !== "string" || (color !== null && !VALID_COLORS.includes(color))) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readTasks();
  const list = data.lists.find((l) => l.id === listId);
  if (!list) {
    return NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
  }

  list.color = color;

  await writeTasks(data);
  return NextResponse.json({ ok: true });
}
