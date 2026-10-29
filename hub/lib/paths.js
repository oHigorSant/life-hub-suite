import path from "node:path";

export const PROJECT_ROOT = process.cwd();
export const DATA_DIR = path.join(PROJECT_ROOT, "data");
export const UPLOADS_DIR = path.join(PROJECT_ROOT, "uploads");
export const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
export const FINANCE_FILE = path.join(DATA_DIR, "finance.json");
export const SESSION_FILE = path.join(DATA_DIR, ".chat-session.json");
export const CHAT_LOG_FILE = path.join(DATA_DIR, "chat-log.jsonl");

// Superfície privilegiada (/dev) — sessão e log SEPARADOS do chat de dados,
// de propósito: as duas nunca compartilham contexto nem histórico.
export const DEV_SESSION_FILE = path.join(DATA_DIR, ".dev-session.json");
export const DEV_LOG_FILE = path.join(DATA_DIR, "dev-log.jsonl");

/** True if `targetPath` resolves inside `dir` (or equals it). */
export function isWithin(dir, targetPath) {
  const resolved = path.resolve(targetPath);
  const base = path.resolve(dir);
  return resolved === base || resolved.startsWith(base + path.sep);
}
