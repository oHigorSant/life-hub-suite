import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DATA_DIR, ROOT } from "./paths.js";

const run = promisify(execFile);
export const AUDIO_DIR = path.join(DATA_DIR, "audio");
fs.mkdirSync(AUDIO_DIR, { recursive: true });

const PY = process.env.ATLAS_TTS_PYTHON || path.join(ROOT, ".venv-tts/bin/python");
const MODELS = process.env.ATLAS_PIPER_DIR || path.join(process.env.HOME, "models/piper");
const VOICES = { A: path.join(MODELS, "pt_BR-faber-medium.onnx"), B: path.join(MODELS, "pt_BR-cadu-medium.onnx") };

/** Prepara o texto para a voz sem mexer nas palavras: símbolos por extenso, sem markdown/emoji, pontuação limpa. */
export function prepareSpeech(text) {
  let s = String(text)
    .replace(/[*_#`~>|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s*°\s*C\b/g, " graus Celsius")
    .replace(/\s*°\s*/g, " graus ")
    .replace(/(\d)\s*%/g, "$1 por cento")
    .replace(/\s=\s/g, " igual a ")
    .replace(/\s\+\s/g, " mais ")
    .replace(/\s[×x]\s(?=\d)/g, " vezes ")
    .replace(/≈/g, " aproximadamente ")
    .replace(/≤/g, " menor ou igual a ")
    .replace(/≥/g, " maior ou igual a ")
    .replace(/→/g, " leva a ")
    .replace(/Δ/g, "delta ")
    .replace(/\s&\s/g, " e ")
    .replace(/\(([^)]*)\)/g, ", $1, ")
    .replace(/…/g, "...")
    .replace(/\.{4,}/g, "...")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*(\.{3})/g, "$1")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (s && !/[.!?…]$/.test(s)) s += ".";
  return s;
}

const PIPER_VOICES = [
  { id: "piper:faber", name: "Faber (grave, calmo)", file: "pt_BR-faber-medium.onnx" },
  { id: "piper:cadu", name: "Cadu (jovem)", file: "pt_BR-cadu-medium.onnx" },
  { id: "piper:jeff", name: "Jeff (claro)", file: "pt_BR-jeff-medium.onnx" },
];
const piperFile = (name) => {
  const v = PIPER_VOICES.find((x) => x.id === `piper:${name}`);
  return v ? path.join(MODELS, v.file) : null;
};
export const piperAvailable = () => fs.existsSync(PY) && PIPER_VOICES.some((v) => fs.existsSync(path.join(MODELS, v.file)));

// ---------------------------------------------------------------- VoiceStudio (mesma lógica do app de inglês)
// POST {VOICESTUDIO}/v1/audio/speech  {model:"tts-1", input, voice, speed, response_format:"wav"}  → áudio
// GET  {VOICESTUDIO}/v1/audio/voices  → {voices:[{voice_id, name, type}]}
export const VOICESTUDIO = (process.env.ATLAS_VOICESTUDIO_URL || process.env.VOICESTUDIO_URL || "http://127.0.0.1:3900").replace(/\/$/, "");

export async function voicestudioUp() {
  try {
    return (await fetch(`${VOICESTUDIO}/system/info`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}

async function speakLine(text, voice, speed = 1) {
  const r = await fetch(`${VOICESTUDIO}/v1/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "tts-1", input: text, voice, speed, response_format: "wav" }),
    signal: AbortSignal.timeout(600_000),
  });
  if (!r.ok) throw new Error(`VoiceStudio erro ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** wav qualquer → PCM s16le mono 24 kHz (para concatenar com precisão). */
function toPcm(wav) {
  return new Promise((resolve, reject) => {
    const p = execFile("ffmpeg", ["-v", "error", "-i", "pipe:0", "-f", "s16le", "-ac", "1", "-ar", "24000", "pipe:1"], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 }, (e, out) => (e ? reject(e) : resolve(out)));
    p.stdin.end(wav);
  });
}

function pcmToMp3(pcm, mp3) {
  return new Promise((resolve, reject) => {
    const p = execFile("ffmpeg", ["-y", "-v", "error", "-f", "s16le", "-ar", "24000", "-ac", "1", "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "96k", mp3], (e) => (e ? reject(e) : resolve()));
    p.stdin.end(pcm);
  });
}


/** Vozes disponíveis agora (ids: "vs:<id>" = VoiceStudio, "piper:<nome>" = Piper local). */
export async function listVoices() {
  const out = { voicestudio: { up: false, url: VOICESTUDIO }, piper: { available: piperAvailable() }, voices: [] };
  if (await voicestudioUp()) {
    out.voicestudio.up = true;
    try {
      const r = await fetch(`${VOICESTUDIO}/v1/audio/voices`, { signal: AbortSignal.timeout(15000) });
      const all = (await r.json()).voices || [];
      for (const v of all) out.voices.push({ id: `vs:${v.voice_id}`, name: v.name || v.voice_id, engine: "voicestudio", type: v.type || "" });
    } catch (e) {
      out.voicestudio.error = String(e.message || e);
    }
  }
  if (out.piper.available) for (const v of PIPER_VOICES) if (fs.existsSync(path.join(MODELS, v.file))) out.voices.push({ id: v.id, name: v.name, engine: "piper" });
  return out;
}

async function piperPcms(items) {
  // items: [{ text, name, speed }] -> Buffer[] (PCM 24k mono), um único processo Python
  const dir = fs.mkdtempSync(path.join(AUDIO_DIR, "tmp_"));
  try {
    const payload = items.map((it, k) => ({ voice: piperFile(it.name), text: it.text, speed: it.speed, out: path.join(dir, `${k}.wav`) }));
    if (payload.some((p) => !p.voice || !fs.existsSync(p.voice))) throw new Error("Voz Piper inexistente.");
    const child = promisify(execFile)(PY, [path.join(ROOT, "scripts/tts.py")], { maxBuffer: 64 * 1024 * 1024, timeout: 3600_000 });
    child.child.stdin.end(JSON.stringify({ items: payload }));
    await child;
    const out = [];
    for (const p of payload) out.push(await toPcm(fs.readFileSync(p.out)));
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** lines: [{ text, voice:"vs:x"|"piper:y", speed }] -> PCM por fala, na ordem. */
async function renderLines(lines, report) {
  const pcms = new Array(lines.length);
  const piperIdx = lines.map((l, i) => (l.voice.startsWith("piper:") ? i : -1)).filter((i) => i >= 0);
  const vsIdx = lines.map((l, i) => (l.voice.startsWith("vs:") ? i : -1)).filter((i) => i >= 0);
  if (lines.some((l) => !/^(vs|piper):/.test(l.voice))) throw new Error("Escolha uma voz para cada apresentador.");
  let done = 0;
  const tick = () => report?.(0.6 + 0.35 * (++done / lines.length), `Gravando voz ${done}/${lines.length}`);
  if (vsIdx.length) {
    if (!(await voicestudioUp())) throw new Error(`VoiceStudio indisponível em ${VOICESTUDIO}. Ligue-o ou escolha uma voz Piper.`);
    for (const i of vsIdx) {
      const wav = await speakLine(lines[i].text, lines[i].voice.slice(3), lines[i].speed);
      pcms[i] = await toPcm(wav);
      tick();
    }
  }
  if (piperIdx.length) {
    const res = await piperPcms(piperIdx.map((i) => ({ text: lines[i].text, name: lines[i].voice.slice(6), speed: lines[i].speed })));
    piperIdx.forEach((i, k) => ((pcms[i] = res[k]), tick()));
  }
  return pcms;
}

/** Roteiro → mp3 com as vozes e a velocidade escolhidas. opts: { voiceA, voiceB, speed }. */
export async function synthesizeScript(id, lines, report, opts = {}) {
  const speed = Math.max(0.6, Math.min(1.6, Number(opts.speed) || 1));
  let { voiceA, voiceB } = opts;
  if (!voiceA || !voiceB) {
    // sem escolha explícita: usa as vozes do VoiceStudio, se estiver no ar
    const lv = await listVoices();
    const vs = lv.voices.filter((v) => v.engine === "voicestudio");
    if (!vs.length) throw new Error("Escolha as vozes antes de gerar o áudio (VoiceStudio está indisponível).");
    const pt = vs.filter((v) => /(^|[^a-z])(pt|br|portugu)/i.test(`${v.id} ${v.name}`));
    const pool = pt.length >= 2 ? pt : vs;
    voiceA = voiceA || pool[0].id;
    voiceB = voiceB || (pool[1] || pool[0]).id;
  }
  const clean = lines.filter((l) => l?.text?.trim()).map((l) => ({ speaker: l.speaker === "B" ? "B" : "A", text: prepareSpeech(l.text) })).filter((l) => l.text.length > 1);
  const pcms = await renderLines(clean.map((l) => ({ text: l.text, voice: l.speaker === "B" ? voiceB : voiceA, speed })), report);
  const gap = Buffer.alloc(Math.round(24000 * 0.4) * 2);
  const chunks = [];
  const times = [];
  let t = 0;
  pcms.forEach((pcm) => {
    const dur = pcm.length / 2 / 24000;
    times.push([Math.round(t * 100) / 100, Math.round((t + dur) * 100) / 100]);
    chunks.push(pcm, gap);
    t += dur + 0.4;
  });
  await pcmToMp3(Buffer.concat(chunks), path.join(AUDIO_DIR, `${id}.mp3`));
  return { file: `${id}.mp3`, duration: Math.round(t * 100) / 100, times, lines: clean.length, voices: [voiceA, voiceB], speed, engine: voiceA.startsWith("vs:") || voiceB.startsWith("vs:") ? "voicestudio" : "piper" };
}

/** Amostra curta para ouvir a voz/velocidade antes de gerar. Devolve o caminho de um mp3 em cache. */
export async function previewVoice({ voice, speed = 1, text }) {
  const sp = Math.max(0.6, Math.min(1.6, Number(speed) || 1));
  const sample = prepareSpeech(text || "Olá! Esta é a voz que vai conduzir o seu podcast de estudo... Vamos aprender juntos?");
  const key = crypto.createHash("sha1").update(`${voice}|${sp}|${sample}`).digest("hex").slice(0, 16);
  const mp3 = path.join(AUDIO_DIR, `preview_${key}.mp3`);
  if (fs.existsSync(mp3)) return mp3;
  const [pcm] = await renderLines([{ text: sample, voice, speed: sp }]);
  await pcmToMp3(pcm, mp3);
  return mp3;
}
