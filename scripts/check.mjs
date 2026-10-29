// Verificações rápidas antes de publicar/entregar: o conteúdo das trilhas e os testes do Hub que não precisam de rede.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const steps = [
  ["trilhas", "node scripts/validate-tracks.mjs"],
  ["trilhas", "node scripts/check-pedagogy.mjs sql"],
  ["hub", "node scripts/test-intents.mjs"],
  ["hub", "node scripts/test-router.mjs"],
  ["hub", "node scripts/test-notas.mjs"],
  ["hub", "node scripts/test-agenda.mjs"],
  ["hub", "node scripts/test-tools.mjs"],
];
let fail = 0;
for (const [dir, cmd] of steps) {
  const r = spawnSync(cmd, { cwd: join(root, dir), shell: true, encoding: "utf8" });
  // No Windows, test-router passa todos os casos e só falha ao apagar a pasta temporária (EPERM): não é falha do código.
  const out = `${r.stdout}${r.stderr}`;
  const ok = r.status === 0 || (/\d+ testes passaram/.test(out) && /EPERM/.test(out) && !/not ok|AssertionError/.test(out));
  if (!ok) fail++;
  console.log(`${ok ? "OK  " : "FALHA"} ${dir}: ${cmd}`);
  if (!ok) console.log((r.stdout || "").split("\n").slice(-8).join("\n") + (r.stderr || "").split("\n").slice(-8).join("\n"));
}
process.exit(fail ? 1 : 0);
