import path from "node:path";
import fs from "node:fs";

export const ROOT = process.env.ATLAS_ROOT || path.join(process.cwd(), "atlas");
export const DATA_DIR = process.env.ATLAS_DATA_DIR || path.join(process.cwd(), "data", "estudos");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const VAULT_DIR = path.join(DATA_DIR, "vault");
export const DB_FILE = path.join(DATA_DIR, "atlas.db");

for (const d of [DATA_DIR, UPLOADS_DIR, VAULT_DIR]) fs.mkdirSync(d, { recursive: true });

export function isWithin(parent, child) {
  const rel = path.relative(parent, path.resolve(child));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}
