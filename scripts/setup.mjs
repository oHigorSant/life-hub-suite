// Primeira execução: instala dependências, cria o .env.local do Hub com segredos aleatórios, cria as pastas de dados
// e compila o Trilhas. Pode rodar de novo sem medo (não sobrescreve o que já existe).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const hub = join(root, "hub");
const trilhas = join(root, "trilhas");
const run = (cmd, cwd) => {
  console.log(`\n$ ${cmd}   (em ${cwd.replace(root, ".")})`);
  const r = spawnSync(cmd, { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) { console.error(`\nFalhou: ${cmd}`); process.exit(r.status || 1); }
};

const major = Number(process.versions.node.split(".")[0]);
if (major < 22) { console.error(`Node ${process.versions.node} é antigo demais: o Hub usa node:sqlite (Node 22 ou mais novo).`); process.exit(1); }

run("npm install --no-audit --no-fund", hub);
run("npm install --no-audit --no-fund", trilhas);

for (const d of [join(hub, "data"), join(hub, "uploads"), join(trilhas, "data")]) mkdirSync(d, { recursive: true });

const envFile = join(hub, ".env.local");
if (existsSync(envFile)) {
  console.log("\n.env.local já existe — mantido como está.");
} else {
  const password = randomBytes(9).toString("base64url");
  const token = randomBytes(32).toString("hex");
  let env = readFileSync(join(hub, ".env.example"), "utf8");
  env = env.replace(/^LIFEHUB_PASSWORD=.*$/m, `LIFEHUB_PASSWORD=${password}`).replace(/^LIFEHUB_AUTH_TOKEN=.*$/m, `LIFEHUB_AUTH_TOKEN=${token}`);
  writeFileSync(envFile, env, { mode: 0o600 });
  console.log(`\nCriei hub/.env.local.\nSenha de login gerada: ${password}\n(Ela fica no arquivo; troque quando quiser e reinicie o Hub.)`);
}

run("npm run build", trilhas);

const claude = spawnSync("claude --version", { shell: true, encoding: "utf8" });
if (claude.status !== 0) console.warn("\nAviso: o comando `claude` (Claude Code) não foi encontrado. O agente de IA do Hub e o Mentor do Trilhas usam o Claude Code logado nesta máquina — instale e rode `claude` uma vez para entrar. Alternativa: configure GEMINI_API_KEY / OPENROUTER_API_KEY em hub/.env.local.");
else console.log(`\nClaude Code encontrado: ${claude.stdout.trim()}`);

console.log(`
Pronto. Próximos passos:
  npm run build   # compila o Hub (e o Trilhas)
  npm start       # Hub em http://localhost:4000  |  Trilhas em http://localhost:4300 (também dentro do Hub, em /trilhas)
  npm run dev     # modo desenvolvimento (Hub com recarga automática)
Leia o README.md e o CLAUDE.md antes de mexer no código.`);
