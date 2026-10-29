import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { UPLOADS_DIR } from "@/lib/paths";

function sanitizeFilename(name) {
  const base = path.basename(name).replace(/[^\w.\-À-ÿ ]+/g, "_");
  return base || "arquivo";
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// Saves an uploaded file (PDF, transcript, image) into uploads/ so it can be
// referenced from the chat and read by the Claude Code agent. Does not
// interpret the file in any way — that happens in the chat turn.
export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const safeName = sanitizeFilename(file.name || "arquivo");
  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);
  let destName = safeName;
  let destPath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, destName);
  let counter = 1;
  while (await exists(destPath)) {
    destName = `${stem}-${counter}${ext}`;
    destPath = path.join(/*turbopackIgnore: true*/ UPLOADS_DIR, destName);
    counter += 1;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(destPath, buffer);

  return NextResponse.json({ ok: true, filename: destName });
}
