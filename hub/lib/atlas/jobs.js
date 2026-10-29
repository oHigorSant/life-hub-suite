import { db, now, uid, j } from "./db.js";

export function createJob(kind, subjectId, refId = null) {
  const id = uid("job_");
  db()
    .prepare("INSERT INTO jobs(id, kind, subject_id, ref_id, status, progress, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(id, kind, subjectId, refId, "queued", 0, now(), now());
  return id;
}

export function updateJob(id, patch) {
  const cur = db().prepare("SELECT * FROM jobs WHERE id=?").get(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  db()
    .prepare("UPDATE jobs SET status=?, progress=?, message=?, result_json=?, updated_at=? WHERE id=?")
    .run(next.status, next.progress, next.message ?? null, patch.result !== undefined ? j(patch.result) : cur.result_json, now(), id);
}

/** Roda `fn(report)` em background (fire-and-forget) acompanhado por um job. */
export function runJob(kind, subjectId, refId, fn) {
  const id = createJob(kind, subjectId, refId);
  const report = (progress, message) => updateJob(id, { status: "running", progress, message });
  setTimeout(async () => {
    try {
      updateJob(id, { status: "running", progress: 0.01, message: "Iniciando…" });
      const result = await fn(report);
      updateJob(id, { status: "done", progress: 1, message: "Concluído", result: result ?? null });
    } catch (e) {
      console.error(`[job ${kind}]`, e);
      updateJob(id, { status: "error", message: String(e?.message || e) });
    }
  }, 0);
  return id;
}

// Jobs que ficaram "running" quando o processo caiu viram erro (evita progresso eterno).
export function sweepStaleJobs() {
  db().exec("UPDATE jobs SET status='error', message='Interrompido (reinício do servidor)' WHERE status IN ('running','queued')");
  db().exec("UPDATE sources SET status='error', error='Interrompido (reinício do servidor)' WHERE status IN ('queued','extracting','analyzing')");
}
