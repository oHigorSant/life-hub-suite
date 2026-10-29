import { json, handle, body } from "@/lib/notas/http.js";
import { homeSummary } from "@/lib/home/summary.js";
import { saveLayout, setWidget, upsertGoal, deleteGoal, setPhrase, fail } from "@/lib/home/store.js";

export const dynamic = "force-dynamic";

// GET /api/home -> resumo da Home (tarefas, contas, estudos, agenda, metas, frase, layout)
export const GET = handle(async () => json(await homeSummary()));

// POST { op }: saveLayout{layout} | setWidget{id,visible} | upsertGoal{goal} | deleteGoal{id} | setPhrase{text,ref}
export const POST = handle(async (request) => {
  const b = await body(request);
  switch (b.op) {
    case "saveLayout": return json(await saveLayout(b.layout));
    case "setWidget": return json(await setWidget(String(b.id), b.visible !== false));
    case "upsertGoal": return json(await upsertGoal(b.goal || {}));
    case "deleteGoal": return json(await deleteGoal(String(b.id)));
    case "setPhrase": return json(await setPhrase(b.text, b.ref));
    default: throw fail("Operação desconhecida.");
  }
});
