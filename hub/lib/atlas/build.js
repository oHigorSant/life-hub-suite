import { db } from "./db.js";
import { runJob } from "./jobs.js";
import { generateRoadmap } from "./roadmap.js";

export async function waitJob(id, { onTick } = {}) {
  for (;;) {
    const j = db().prepare("SELECT * FROM jobs WHERE id=?").get(id);
    if (!j) throw new Error("job sumiu");
    onTick?.(j);
    if (j.status === "done") return j;
    if (j.status === "error") throw new Error(j.message || "falhou");
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/** Orquestra: espera as fontes ficarem prontas e então gera a árvore. Sobrevive ao usuário fechar a aba. */
export function buildSubject(subjectId, ingestJobIds, { prompt = "" } = {}) {
  return runJob("build", subjectId, null, async (report) => {
    const total = ingestJobIds.length;
    if (total) {
      const done = new Set();
      await Promise.all(
        ingestJobIds.map((id) =>
          waitJob(id, {
            onTick: (j) => {
              const avg = ingestJobIds.reduce((a, x) => a + (x === id ? j.progress : (db().prepare("SELECT progress FROM jobs WHERE id=?").get(x)?.progress ?? 0)), 0) / total;
              report(0.02 + 0.6 * avg, j.message ? `Material: ${j.message}` : "Lendo material…");
            },
          }).then(() => done.add(id))
        )
      );
    }
    report(0.65, "Construindo a árvore de habilidades…");
    const rid = generateRoadmap(subjectId, { prompt });
    await waitJob(rid, { onTick: (j) => report(0.65 + 0.33 * j.progress, j.message || "Construindo a árvore…") });
    return { ok: true };
  });
}
