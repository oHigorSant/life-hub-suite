import { promises as fs } from "node:fs";
import { CHAT_LOG_FILE } from "./paths.js";

// Append-only, unconditional record of every message exchanged through the
// web chat — the "nothing typed here is ever lost" guarantee, independent
// of whatever structured file (tasks.json, finance.json, ...) the message
// also ends up affecting. One JSON object per line (JSONL) so writing is a
// plain append, never a read-modify-write of a growing file.
export async function appendChatLog(role, content, extra = {}, logFile = CHAT_LOG_FILE) {
  const entry = {
    timestamp: new Date().toISOString(),
    role,
    content,
    ...extra,
  };
  await fs.appendFile(logFile, JSON.stringify(entry) + "\n", "utf8");
}
