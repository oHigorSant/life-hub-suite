import fs from "node:fs";
import { ptScore } from "../lib/ingles/text.js";
const d = JSON.parse(fs.readFileSync("data/ingles/lessons.json", "utf8"));
let bad = 0, sus = 0, big = 0;
for (const l of d.lessons) {
  for (const b of l.blocks) {
    const s = (b.en || "") + (b.pt || "") + (b.back || "");
    if (/^[A-Za-z0-9+/]{10,}=*$/.test(b.en || "") || /CIMV|©|Curso de Ingl/.test(s)) { if (bad++ < 6) console.log("RUÍDO", l.id, JSON.stringify(b).slice(0, 140)); }
    if (b.t === "pair" && ptScore(b.en) > 1) { if (sus++ < 8) console.log("EN PARECE PT", l.id, b.en.slice(0, 100)); }
    if (b.t === "pair" && ptScore(b.pt) < -1) { if (sus++ < 12) console.log("PT PARECE EN", l.id, b.pt.slice(0, 100)); }
    if ((b.en || "").length > 420) { if (big++ < 5) console.log("BLOCO GRANDE", l.id, b.en.length); }
  }
}
console.log({ bad, sus, big });
