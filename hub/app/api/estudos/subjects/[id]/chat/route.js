import { db } from "@/lib/atlas/db.js";
import { chat } from "@/lib/atlas/chat.js";
import { ok, fail, route } from "@/lib/atlas/api.js";

export const dynamic = "force-dynamic";

export const GET = route(async (req, { id }) => {
  return ok({ messages: db().prepare("SELECT id, role, content, created_at FROM chat WHERE subject_id=? ORDER BY id DESC LIMIT 60").all(id).reverse() });
});

export const POST = route(async (req, { id }) => {
  const b = await req.json();
  if (!b.message?.trim()) return fail("Mensagem vazia.");
  return ok(await chat(id, b.message.trim()));
});
