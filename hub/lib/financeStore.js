import { promises as fs } from "node:fs";
import path from "node:path";
import { FINANCE_FILE } from "./paths.js";

const EMPTY = {
  accounts: [],
  categories: [],
  transactions: [],
  bills: [],
  subscriptions: [],
  layouts: [],
  meta: { openFinance: { lastSyncedAt: null }, processedUploads: [] },
};

export async function readFinance() {
  try {
    const raw = await fs.readFile(FINANCE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY,
      ...parsed,
      meta: {
        ...EMPTY.meta,
        ...parsed.meta,
        openFinance: { ...EMPTY.meta.openFinance, ...parsed.meta?.openFinance },
      },
    };
  } catch (err) {
    if (err.code === "ENOENT") return { ...EMPTY };
    throw err;
  }
}

// Atomic-ish write, same pattern as tasksStore: temp file + rename.
export async function writeFinance(data) {
  const json = JSON.stringify(data, null, 2) + "\n";
  const tmpFile = path.join(
    path.dirname(FINANCE_FILE),
    `.finance.json.tmp-${process.pid}-${Date.now()}`
  );
  await fs.writeFile(tmpFile, json, "utf8");
  await fs.rename(tmpFile, FINANCE_FILE);
}
