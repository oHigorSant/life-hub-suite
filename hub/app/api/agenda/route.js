import { readAgenda, upsertEvent, deleteEvent, upsertRoutine, deleteRoutine, logPomodoro, savePomodoroSettings, saveSettings, fail } from "@/lib/agenda/store.js";
import { timeAction, ensureTimers } from "@/lib/agenda/timers.js";
import { json, handle, body } from "@/lib/notas/http.js";

export const dynamic = "force-dynamic";

// GET /api/agenda -> { events, routines, pomodoro, settings, timer, stopwatch, pomo, serverNow }
export const GET = handle(async () => {
  ensureTimers();
  return json(readAgenda());
});

// POST { op, ... }: upsertEvent{event} | deleteEvent{id} | upsertRoutine{routine} | deleteRoutine{id}
//                   | logPomodoro{entry} | savePomodoro{pomodoro} | saveSettings{settings}
//                   | time{kind: timer|stopwatch|pomo, action, ...params}
export const POST = handle(async (request) => {
  const b = await body(request);
  switch (b.op) {
    case "upsertEvent": return json(await upsertEvent(b.event || {}));
    case "deleteEvent": return json(await deleteEvent(String(b.id)));
    case "upsertRoutine": return json(await upsertRoutine(b.routine || {}));
    case "deleteRoutine": return json(await deleteRoutine(String(b.id)));
    case "logPomodoro": return json(await logPomodoro(b.entry || {}), 201);
    case "savePomodoro": {
      const r = await savePomodoroSettings(b.pomodoro || {});
      await timeAction("pomo", "refresh");
      return json(r);
    }
    case "saveSettings": return json(await saveSettings(b.settings || {}));
    case "time": return json(await timeAction(String(b.kind), String(b.action), b));
    default: throw fail("Operação desconhecida.");
  }
});
