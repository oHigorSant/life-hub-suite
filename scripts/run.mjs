// Executa o Hub e o Trilhas juntos. Uso: node scripts/run.mjs <build|dev|start>
import { spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const apps = { hub: join(root, "hub"), trilhas: join(root, "trilhas") };

if (mode === "build") {
  for (const [name, cwd] of Object.entries({ trilhas: apps.trilhas, hub: apps.hub })) {
    console.log(`\n== build ${name}`);
    const r = spawnSync("npm run build", { cwd, stdio: "inherit", shell: true });
    if (r.status !== 0) process.exit(r.status || 1);
  }
  process.exit(0);
}

// O Trilhas serve o build (dist) nos dois modos; para mexer na interface dele use `npm run dev` dentro de trilhas/.
const plan = {
  dev: [["hub", "npm run dev"], ["trilhas", "npm start"]],
  start: [["hub", "npm start"], ["trilhas", "npm start"]],
}[mode];
if (!plan) { console.error("Uso: node scripts/run.mjs <build|dev|start>"); process.exit(1); }

const kids = plan.map(([name, cmd]) => {
  const p = spawn(cmd, { cwd: apps[name], shell: true, env: process.env });
  const tag = `[${name}] `;
  for (const [stream, out] of [[p.stdout, process.stdout], [p.stderr, process.stderr]]) {
    let buf = "";
    stream.on("data", (d) => { buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop(); for (const l of lines) out.write(tag + l + "\n"); });
  }
  p.on("exit", (code) => { console.log(`${tag}saiu com código ${code}`); stop(); });
  return p;
});
function stop() { for (const k of kids) { try { k.kill(); } catch {} } process.exit(0); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
