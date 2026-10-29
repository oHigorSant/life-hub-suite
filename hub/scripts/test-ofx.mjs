// node scripts/test-ofx.mjs — testa o leitor de OFX (SGML v1, XML v2, cartão, valores com vírgula, acentos em windows-1252).
import assert from "node:assert/strict";
import { parseOfx, ofxDate, ofxAmount } from "../lib/finance/ofx.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>Nubank<FID>260</FI></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>0260<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905120000[-3:BRT]<TRNAMT>-40.50<FITID>abc1<NAME>MERCADO BOM PRECO<MEMO>Compra no debito</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910<TRNAMT>1.500,00<FITID>abc2<MEMO>Salario</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912<TRNAMT>0<FITID>zero<NAME>Zero</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>2345.67<DTASOF>20260930</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

const XML = `<?xml version="1.0" encoding="UTF-8"?><OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>BRL</CURDEF>
<CCACCTFROM><ACCTID>4111-xxxx</ACCTID></CCACCTFROM><BANKTRANLIST><DTSTART>20261001</DTSTART><DTEND>20261020</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003000000</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>x1</FITID><MEMO>Uber *Trip &amp; Co</MEMO></STMTTRN>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20261015000000</DTPOSTED><TRNAMT>500.00</TRNAMT><FITID>x2</FITID><MEMO>Pagamento recebido</MEMO></STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

t("datas", () => { assert.equal(ofxDate("20260915120000[-3:BRT]"), "2026-09-15"); assert.equal(ofxDate("x"), null); });
t("valores", () => {
  assert.equal(ofxAmount("-40.50"), -40.5); assert.equal(ofxAmount("1.500,00"), 1500); assert.equal(ofxAmount("1,500.25"), 1500.25);
  assert.equal(ofxAmount("-12,34"), -12.34); assert.ok(Number.isNaN(ofxAmount("")));
});
t("SGML: conta, período e saldo", () => {
  const p = parseOfx(SGML);
  assert.equal(p.bank.org, "Nubank"); assert.equal(p.account.id, "12345-6"); assert.equal(p.account.isCard, false);
  assert.deepEqual(p.period, { from: "2026-09-01", to: "2026-09-30" }); assert.equal(p.balance.amount, 2345.67); assert.equal(p.currency, "BRL");
});
t("SGML: lançamentos (ignora valor zero)", () => {
  const p = parseOfx(SGML);
  assert.equal(p.transactions.length, 2);
  assert.deepEqual(p.transactions[0], { fitid: "abc1", date: "2026-09-05", amount: 40.5, type: "expense", trntype: "DEBIT", description: "MERCADO BOM PRECO - Compra no debito", checkNum: null });
  assert.equal(p.transactions[1].type, "income"); assert.equal(p.transactions[1].amount, 1500); assert.equal(p.transactions[1].description, "Salario");
});
t("XML cartão de crédito", () => {
  const p = parseOfx(XML);
  assert.equal(p.account.isCard, true); assert.equal(p.account.id, "4111-xxxx"); assert.equal(p.transactions.length, 2);
  assert.equal(p.transactions[0].description, "Uber *Trip & Co"); assert.equal(p.transactions[0].type, "expense");
});
t("windows-1252 (acentos)", () => {
  const raw = Buffer.concat([Buffer.from("OFXHEADER:100\nCHARSET:1252\n\n<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260101<TRNAMT>-10<FITID>1<MEMO>Padaria S", "latin1"), Buffer.from([0xe3]), Buffer.from("o Jo", "latin1"), Buffer.from([0xe3]), Buffer.from("o</STMTTRN></BANKTRANLIST></OFX>", "latin1")]);
  assert.equal(parseOfx(raw).transactions[0].description, "Padaria São João");
});
t("rejeita arquivo que não é OFX", () => assert.throws(() => parseOfx("a,b,c\n1,2,3"), /OFX/));

console.log(`\n${n} testes passaram`);
