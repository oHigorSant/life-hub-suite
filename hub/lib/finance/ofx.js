// Leitor de OFX/QFX (SGML da v1 e XML da v2). Só extrai; quem decide o que gravar é lib/finance/ofxImport.js.

/** Decodifica o arquivo respeitando CHARSET do cabeçalho (bancos brasileiros costumam mandar windows-1252). */
export function decodeOfx(buffer) {
  const head = Buffer.from(buffer.subarray(0, 600)).toString("latin1");
  const cs = (head.match(/CHARSET:\s*(\w+)/i) || [])[1];
  const enc = (head.match(/ENCODING:\s*(\w+)/i) || [])[1];
  const utf8 = (cs && /utf-?8/i.test(cs)) || (enc && /utf-?8/i.test(enc)) || /<\?xml[^>]*encoding=["']utf-8/i.test(head);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    if (utf8) return new TextDecoder("utf-8").decode(buffer);
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}>([^<\\r\\n]*)`, "i"));
  return m ? decodeEntities(m[1].trim()) : "";
};

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#0?39;/g, "'");
}

/** "20260915120000[-3:BRT]" -> "2026-09-15" */
export function ofxDate(v) {
  const m = String(v || "").match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "-1.234,56" | "-1234.56" | "1234,56" -> number */
export function ofxAmount(v) {
  let s = String(v || "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  const lastC = s.lastIndexOf(","), lastD = s.lastIndexOf(".");
  if (lastC >= 0 && lastD >= 0) s = lastC > lastD ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastC >= 0) s = s.replace(",", ".");
  return Number(s);
}

const clean = (s) => s.replace(/\s+/g, " ").trim();

export function parseOfx(input) {
  const text = typeof input === "string" ? input : decodeOfx(input);
  if (!/<OFX>/i.test(text) && !/<STMTTRN>/i.test(text)) throw Object.assign(new Error("Este arquivo não parece ser um OFX válido."), { status: 400 });

  const isCard = /<CCSTMTRS>|<CCSTMTTRNRS>/i.test(text);
  const acctBlock = (text.match(/<(CCACCTFROM|BANKACCTFROM)>([\s\S]*?)(?=<\/\1>|<BANKTRANLIST>|<LEDGERBAL>|$)/i) || [])[2] || "";
  const ledger = (text.match(/<LEDGERBAL>([\s\S]*?)(?=<\/LEDGERBAL>|<AVAILBAL>|<\/STMTRS>|<\/CCSTMTRS>|$)/i) || [])[1] || "";
  const org = tag(text, "ORG");
  const fid = tag(text, "FID");

  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<\/STMTRS>|<\/CCSTMTRS>/i)[0]);
  const transactions = [];
  for (const b of blocks) {
    const date = ofxDate(tag(b, "DTPOSTED") || tag(b, "DTUSER"));
    const amount = ofxAmount(tag(b, "TRNAMT"));
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    const name = clean(tag(b, "NAME")), memo = clean(tag(b, "MEMO"));
    const description = name && memo && !memo.toLowerCase().includes(name.toLowerCase()) && !name.toLowerCase().includes(memo.toLowerCase()) ? `${name} - ${memo}` : name.length >= memo.length ? name || memo : memo;
    transactions.push({
      fitid: tag(b, "FITID") || null,
      date,
      amount: Math.round(Math.abs(amount) * 100) / 100,
      type: amount < 0 ? "expense" : "income",
      trntype: tag(b, "TRNTYPE").toUpperCase() || null,
      description: description || "Sem descrição",
      checkNum: tag(b, "CHECKNUM") || null,
    });
  }
  const dates = transactions.map((t) => t.date).sort();
  return {
    bank: { org: org || null, fid: fid || null, bankId: tag(acctBlock, "BANKID") || null },
    account: { id: tag(acctBlock, "ACCTID") || null, type: tag(acctBlock, "ACCTTYPE").toUpperCase() || (isCard ? "CREDITCARD" : null), isCard },
    currency: tag(text, "CURDEF") || "BRL",
    balance: ledger ? { amount: ofxAmount(tag(ledger, "BALAMT")), date: ofxDate(tag(ledger, "DTASOF")) } : null,
    period: { from: ofxDate(tag(text, "DTSTART")) || dates[0] || null, to: ofxDate(tag(text, "DTEND")) || dates[dates.length - 1] || null },
    transactions,
  };
}
