import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("data/ingles/lessons.json", "utf8"));
const want = process.argv.slice(2);
if (!want.length) {
  for (const g of d.groups) {
    const ls = g.lessons.map((id) => d.lessons.find((l) => l.id === id));
    console.log(g.phase.padEnd(10), g.title.padEnd(36), g.kind.padEnd(13), ls.map((l) => `${l.part}:${l.blocks.length}/${l.words}`).join(" "));
  }
} else {
  for (const id of want) {
    const l = d.lessons.find((x) => x.id === id);
    console.log("=====", l.id, l.title, l.kind, "audios:", l.audios.map((a) => a.label).join(", "));
    const types = {};
    l.blocks.forEach((b) => (types[b.t] = (types[b.t] || 0) + 1));
    console.log(types);
    console.log(JSON.stringify(l.blocks.slice(0, 7), null, 1));
    console.log("... last:", JSON.stringify(l.blocks.slice(-2)));
  }
}
