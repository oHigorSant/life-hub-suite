import { listBoards, createBoard } from "@/lib/quadros/store.js";
import { json, handle, body } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

export const GET = handle(async () => json({ boards: listBoards() }));

export const POST = handle(async (request) => {
  const b = await body(request);
  return json(createBoard(b.name), 201);
});
