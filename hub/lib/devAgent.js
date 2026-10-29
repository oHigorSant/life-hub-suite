import { promises as fs } from "node:fs";
import { DEV_SESSION_FILE } from "./paths.js";
import { route } from "./agent/router.js";

// ATENÇÃO — esta é a superfície PRIVILEGIADA do sistema (página /dev): o agente pode editar o código do projeto e rodar
// comandos. Quem alcança esta rota executa código nesta máquina; a autenticação do hub (login) fica na frente.
//
// Quem atende é escolhido pelo roteador (lib/agent/router.js, superfície "dev"): Claude CLI (sessão própria, ferramentas
// completas) ou os motores de API (Gemini/OpenRouter) com ferramentas de arquivo e bash do projeto. Antes de cada turno
// o roteador guarda uma cópia do código (~/backups/dev-snapshots) como rede de segurança.
//
// A trava do chat de dados (hubAgent.js / engines/toolkit.js, superfície "dados") NÃO deve ser afrouxada para
// reaproveitar código daqui — as duas superfícies são separadas de propósito.

export async function sendDevMessage(message) {
  const r = await route({ surface: "dev", message });
  return { ok: r.ok, reply: r.reply, engine: r.engine, model: r.model };
}

/** Esquece a sessão atual do Claude no /dev — a próxima mensagem começa do zero. */
export async function resetDevSession() {
  try {
    await fs.unlink(DEV_SESSION_FILE);
  } catch {
    // já não existia
  }
}
