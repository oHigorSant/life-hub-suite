import { readBoard, saveBoard, deleteBoard } from "@/lib/quadros/store.js";
import { json, handle, body } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

export const GET = handle(async (_request, { params }) => json(readBoard((await params).id)));

// PUT { name?, scene? } -> renomeia e/ou salva a cena
export const PUT = handle(async (request, { params }) => json(saveBoard((await params).id, await body(request))));

export const DELETE = handle(async (_request, { params }) => {
  deleteBoard((await params).id);
  return json({ ok: true });
});
