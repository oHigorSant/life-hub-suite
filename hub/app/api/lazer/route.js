import { NextResponse } from "next/server";
import { readLazer, addItem, updateItem, deleteItem, reorder, fetchMeta, searchImages, CATEGORIES, STATUSES } from "@/lib/lazer/store";
import { emit } from "@/lib/live/bus";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...readLazer(), categories: CATEGORIES, statuses: STATUSES });
}

/** op: add {input, category?, status?} | update {id, ...campos} | delete {id} | reorder {ids} | meta {url} | search {q, category?, link?} */
export async function POST(req) {
  try {
    const b = await req.json();
    let out;
    if (b.op === "add") out = { item: await addItem(b) };
    else if (b.op === "update") out = { item: updateItem(b.id, b) };
    else if (b.op === "delete") { deleteItem(b.id); out = {}; }
    else if (b.op === "reorder") { reorder(b.ids || []); out = {}; }
    else if (b.op === "meta") return NextResponse.json(await fetchMeta(String(b.url || "")));
    else if (b.op === "search") return NextResponse.json({ results: await searchImages(b.q, b.category, b.link) });
    else return NextResponse.json({ error: "Operação desconhecida" }, { status: 400 });
    emit("lazer");
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
