import { promises as fs } from "node:fs";
import path from "node:path";
import { TASKS_FILE } from "./paths.js";
import { emit } from "./live/bus.js";

const EMPTY = { boards: [], lists: [], labels: [], cards: [] };

export async function readTasks() {
  try {
    const raw = await fs.readFile(TASKS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const data = { ...EMPTY, ...parsed };
    // Histórico: cards concluídos antes de existir `completedAt` usam a última atualização como melhor estimativa.
    for (const c of data.cards) {
      if (c.done && !c.completedAt) c.completedAt = c.updatedAt || c.createdAt || null;
    }
    return data;
  } catch (err) {
    if (err.code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

// Atomic-ish write: write to a temp file in the same directory, then rename.
// Avoids leaving tasks.json half-written if the process dies mid-write.
export async function writeTasks(data) {
  const json = JSON.stringify(data, null, 2) + "\n";
  const tmpFile = path.join(
    path.dirname(TASKS_FILE),
    `.tasks.json.tmp-${process.pid}-${Date.now()}`
  );
  await fs.writeFile(tmpFile, json, "utf8");
  await fs.rename(tmpFile, TASKS_FILE);
  emit("tasks", { source: "api" }); // as telas abertas atualizam na hora
}
