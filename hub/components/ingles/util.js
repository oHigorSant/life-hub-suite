// Utilitários do módulo Inglês no navegador.

export const audioUrl = (file) => `/course_audios/${encodeURIComponent(file)}`;

export async function api(url, opts) {
  const r = await fetch(url, { cache: "no-store", ...opts, headers: { "content-type": "application/json", ...(opts?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erro ${r.status}`);
  return j;
}

export const post = (url, body) => api(url, { method: "POST", body: JSON.stringify(body) });

export function fmtTime(s) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/** Último índice i com starts[i] <= t (ou -1). `starts` é não-decrescente. */
export function findIndexAt(starts, t) {
  let lo = 0, hi = starts.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/**
 * Destaca elementos conforme o tempo do áudio, sem re-renderizar o React a cada quadro.
 * "now" = elemento atual; "read" = já falados (opcional).
 */
export class Tracker {
  constructor(getEl, starts, { read = true } = {}) {
    this.getEl = getEl;
    this.starts = starts;
    this.read = read;
    this.cur = -1;
  }
  reset() {
    for (let i = 0; i <= this.cur; i++) this.getEl(i)?.classList.remove("now", "read");
    this.cur = -1;
  }
  set(t) {
    const idx = findIndexAt(this.starts, t);
    if (idx === this.cur) return idx;
    const old = this.cur;
    if (old >= 0) this.getEl(old)?.classList.remove("now");
    if (this.read) {
      if (idx > old) for (let k = Math.max(0, old); k <= idx; k++) this.getEl(k)?.classList.add("read");
      else for (let k = Math.max(0, idx + 1); k <= old; k++) this.getEl(k)?.classList.remove("read");
    }
    if (idx >= 0) {
      const el = this.getEl(idx);
      el?.classList.add("now");
      el?.classList.remove("read");
    }
    this.cur = idx;
    return idx;
  }
}

export const KIND_LABEL = { story: "História", mining: "Mineração", complete: "Texto completo", pronunciation: "Pronúncia", phrasal: "Phrasal verbs", lecture: "Aula", grammar: "Gramática" };

export const STATUS_LABEL = { locked: "Bloqueada", available: "Disponível", in_progress: "Em andamento", passed: "Aprovada", mastered: "Dominada" };

export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem("ing-prefs") || "{}"); } catch { return {}; }
}
export function savePrefs(p) {
  try { localStorage.setItem("ing-prefs", JSON.stringify(p)); } catch {}
}
