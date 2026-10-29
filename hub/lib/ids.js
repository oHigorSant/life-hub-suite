const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

// Same format Claude Code is instructed to use in CLAUDE.md: "<prefix>_" +
// 8 random lowercase alphanumeric chars. Kept identical so ids created by
// direct-write API routes and ids created by the chat agent are
// indistinguishable in tasks.json.
export function generateId(prefix) {
  let s = "";
  for (let i = 0; i < 8; i++) s += CHARS[Math.floor(Math.random() * CHARS.length)];
  return `${prefix}_${s}`;
}

export function nowIso() {
  return new Date().toISOString();
}
