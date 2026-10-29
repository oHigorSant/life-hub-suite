import { NextResponse } from "next/server";
import { readFinance, writeFinance } from "@/lib/financeStore";

// Direct write: saving the arrangement of widgets on a layout is a purely
// visual/structural action (like reordering lists on the tasks board), not
// something that needs interpretation — so it writes straight through.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { layoutId, widgets } = body ?? {};
  if (typeof layoutId !== "string" || !Array.isArray(widgets)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const data = await readFinance();
  const layout = data.layouts.find((l) => l.id === layoutId);
  if (!layout) {
    return NextResponse.json({ error: "Layout não encontrado." }, { status: 404 });
  }

  layout.widgets = widgets;
  await writeFinance(data);
  return NextResponse.json({ ok: true });
}
