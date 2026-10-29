// Integração opcional com as Notas do Life Hub (PUT /api/notas/note). Se o Hub não estiver acessível
// (ex.: rodando no Windows em desenvolvimento), as notas ficam só no Trilhas e o status vira 'off'.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Padrões para o repositório com hub/ e 	rilhas/ lado a lado; em outro layout, defina HUB_URL e HUB_ENV_FILE.
const HUB_URL = process.env.HUB_URL || 'http://127.0.0.1:4000';
const HUB_ENV_FILE = process.env.HUB_ENV_FILE || join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hub', '.env.local');

let token = null;
const readToken = () => {
  if (!existsSync(HUB_ENV_FILE)) return null;
  const m = readFileSync(HUB_ENV_FILE, 'utf8').match(/^LIFEHUB_AUTH_TOKEN=(.*)$/m);
  return m ? m[1].trim() : null;
};

async function call(method, url, body, retry = true) {
  token ||= readToken();
  if (!token) throw Object.assign(new Error('hub indisponível'), { off: true });
  const r = await fetch(`${HUB_URL}${url}`, {
    method,
    headers: { cookie: `lh_auth=${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 401 && retry) { token = readToken(); return call(method, url, body, false); }
  if (!r.ok) throw Object.assign(new Error(`hub respondeu ${r.status}`), { status: r.status });
  return r.json().catch(() => ({}));
}

export const hubAvailable = () => existsSync(HUB_ENV_FILE);

const clean = (s) => String(s).replace(/[<>:"|?*\\/\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Nota';
const tag = (s) => String(s).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, '-').replace(/^-|-$/g, '');

export function toRaw(note) {
  const area = ['Estudos', note.source?.trackTitle].filter(Boolean).join(' > ');
  const tags = [...new Set(['trilhas', ...(note.tags || [])].map(tag).filter(Boolean))];
  const origem = [note.source?.trackTitle, note.source?.chapterTitle, note.source?.lessonTitle].filter(Boolean).join(' > ');
  return `---\ntipo: insight\narea: ${area}\ntags: [${tags.join(', ')}]${origem ? `\norigem: ${origem}` : ''}\n---\n\n# ${note.title}\n\n${note.body}\n`;
}

// Cria/atualiza a nota no Hub. Retorna { status, path }.
export async function pushNote(note) {
  try {
    const raw = toRaw(note);
    if (note.hub?.path) {
      await call('PUT', '/api/notas/note', { path: note.hub.path, raw });
      return { status: 'synced', path: note.hub.path };
    }
    const base = `Trilhas/${clean(note.source?.trackTitle || 'Geral')}/${clean(note.title)}`;
    for (let i = 1; i <= 20; i++) {
      const path = `${base}${i > 1 ? ` ${i}` : ''}.md`;
      try {
        await call('POST', '/api/notas/note', { path, raw });
        return { status: 'synced', path };
      } catch (e) {
        if (e.status !== 409) throw e;
      }
    }
    throw new Error('nome de nota esgotado');
  } catch (e) {
    return { status: e.off ? 'off' : 'pending', path: note.hub?.path || null };
  }
}

export async function removeNote(note) {
  if (!note.hub?.path) return;
  try { await call('DELETE', `/api/notas/note?path=${encodeURIComponent(note.hub.path)}`); } catch {}
}
