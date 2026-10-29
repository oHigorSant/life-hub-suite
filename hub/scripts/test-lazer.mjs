// Testes da Área de Lazer (sem rede): node scripts/test-lazer.mjs
import assert from "node:assert/strict";
import { youtubeId, guessCategory, assertPublicUrl } from "../lib/lazer/store.js";

let ok = 0;
const t = async (name, fn) => { try { await fn(); ok++; } catch (e) { console.error("FALHOU:", name, "\n ", e.message); process.exitCode = 1; } };

await t("id do YouTube em todos os formatos", () => {
  assert.equal(youtubeId("https://www.youtube.com/watch?v=jNQXAC9IVRw&t=10s"), "jNQXAC9IVRw");
  assert.equal(youtubeId("https://youtu.be/jNQXAC9IVRw?si=x"), "jNQXAC9IVRw");
  assert.equal(youtubeId("https://www.youtube.com/shorts/abcDEF12345"), "abcDEF12345");
  assert.equal(youtubeId("https://m.youtube.com/watch?v=jNQXAC9IVRw"), "jNQXAC9IVRw");
  assert.equal(youtubeId("https://vimeo.com/123"), null);
});

await t("categoria pelo site", () => {
  assert.equal(guessCategory("https://youtu.be/x"), "video");
  assert.equal(guessCategory("https://www.imdb.com/title/tt0111161/"), "filme");
  assert.equal(guessCategory("https://www.goodreads.com/book/show/1"), "livro");
  assert.equal(guessCategory("https://github.com/x/y"), "projeto");
  assert.equal(guessCategory("https://example.com"), "outro");
});

await t("o servidor não busca endereços internos", async () => {
  for (const u of ["http://localhost:4000/", "http://127.0.0.1/", "http://192.168.0.10/", "http://10.0.0.1/", "http://100.64.0.10:4200/", "file:///etc/passwd", "http://meu-servidor.exemplo.ts.net/"]) {
    await assert.rejects(() => assertPublicUrl(u), undefined, u);
  }
});

console.log(`${ok} testes ok`);
