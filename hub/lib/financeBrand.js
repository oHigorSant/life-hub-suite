// Ícones de marca reais (extraídos do pacote open-source simple-icons,
// CC0/MIT — só o path SVG de cada um, não a biblioteca inteira, pra não
// carregar milhares de ícones não usados no bundle) + cor oficial de cada
// marca. Cobre só as 4 marcas globais que existem nesse pacote — bancos
// brasileiros como Caixa, C6 e 99 não têm ícone lá, então usam a cor da
// marca só no monograma (ver FINANCE_MARK abaixo).
export const BRAND_ICON_PATHS = {
  nubank:
    "M7.2795 5.4336c-1.1815 0-2.1846.4628-2.9432 1.252h-.002c-.0541-.0022-.1074-.002-.162-.002-1.5436 0-2.9925.8835-3.699 2.2559-.3088.5996-.4234 1.2442-.459 1.9003-.0321.589 0 1.1863 0 1.7696v5.6523H3.184s.0022-2.784 0-5.1777c-.0014-1.6112-.0118-3.0471 0-3.3418.056-1.3937.4372-2.3053 1.1484-3.0508 2.3585.0018 3.8852 1.6091 3.9705 4.168.0196.5874.0254 3.7304.0254 3.7304v3.672h3.1678v-4.965c0-1.5007.0127-2.8006-.0918-3.6952-.292-2.5-1.821-4.168-4.1248-4.168zm8.3903.3008l-3.166.0039v4.9648c0 1.5009-.0127 2.8007.0919 3.6953.2921 2.5001 1.821 4.168 4.1248 4.168 1.1815 0 2.1846-.4628 2.9432-1.252.0003-.0003.0016.0004.002 0 .0542.0023.1093.002.164.002 1.5435 0 2.9905-.8835 3.6971-2.2558.3088-.5997.4233-1.2442.459-1.9004.032-.5889 0-1.1862 0-1.7695V5.7383H20.816s-.0022 2.784 0 5.1777c.0015 1.6113.0119 3.047 0 3.3418-.056 1.3935-.4372 2.3053-1.1483 3.0508-2.3586-.0018-3.8853-1.6091-3.9706-4.168-.0196-.5874-.0273-2.0437-.0273-3.7324Z",
  picpay:
    "M16.463 1.587v7.537H24V1.587zm1.256 1.256h5.025v5.025h-5.025zm1.256 1.256v2.513h2.513V4.099zM3.77 5.355V8.53h3.376c2.142 0 3.358 1.04 3.358 2.939 0 1.947-1.216 3.011-3.358 3.011H3.769V8.53H0v13.884h3.769v-4.76h3.57c4.333 0 6.815-2.352 6.815-6.32 0-3.771-2.482-5.978-6.814-5.978Z",
  google:
    "M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z",
  anthropic:
    "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z",
};

// Marca da Caixa: o "X" estilizado extraído do SVG oficial (Wikimedia
// Commons, logo 1997 — https://commons.wikimedia.org/wiki/File:Caixa_Econômica_Federal_logo_1997.svg),
// isolado do restante do logotipo (a palavra "caixa"). Duas cores próprias
// (laranja + azul), por isso não entra no padrão "ícone branco sobre fundo
// colorido" dos outros — desenha sobre fundo branco, com as cores reais.
const CAIXA_MARK = {
  viewBox: "50 -6 66 42",
  bg: "#fff",
  paths: [
    {
      d: "M310.18 161.61h4.41l4.83-4.84h-4.41zM318.42 153.36l1.49 2.92 4.83-4.83h-4.41z",
      fill: "#f7941d",
    },
    { d: "M310.03 161.61h-3.69l1.61-10.16h3.69z", fill: "#0066b3" },
    { d: "M319.91 156.28h-4.41l-2.46-4.83h4.41z", fill: "#0066b3" },
    { d: "M321.88 161.61h-4.41l-.97-1.92 2.92-2.92z", fill: "#0066b3" },
  ],
  transform: "matrix(2.92153 0 0 2.92153 -838.161 -441.968)",
};

// Marca do C6 Bank: o monograma "C6" do pacote Arcticons (ícone de app
// open-source, CC BY-SA 4.0 — https://github.com/Arcticons-Team/Arcticons,
// icons/black/c6bank.svg), sem a moldura quadrada externa do ícone de app
// original (só o monograma, já que aqui ele vai dentro do círculo do
// avatar). Traço, não preenchimento — por isso não cabe no padrão de
// `path fill` dos outros ícones.
const C6_MARK = {
  viewBox: "0 0 48 48",
  bg: "#1B1B1E",
  strokeWidth: 3,
  strokePaths: [
    "M22.1473,26.6345v.0655c0,2.9271-2.3729,5.3-5.3,5.3h0c-2.9271,0-5.3-2.3729-5.3-5.3v-5.4c0-2.9271,2.3729-5.3,5.3-5.3h0c2.9271,0,5.3,2.3729,5.3,5.3v.0655",
    "M35.9843,17.9514c-.8832-1.1565-2.229-1.9514-4.4594-1.9514h-.3721c-2.9271,0-5.3,2.3729-5.3,5.3v5.4",
  ],
  circles: [{ cx: 31.1527, cy: 26.7, r: 5.3 }],
};

// Nome exato (como aparece em accounts[].name / bills[].name / transactions
// description) -> ícone de marca + cor de fundo. `bg` sempre a cor oficial
// da marca, exceto Claude (usa o tom "clay" da marca, mais vivo que o preto
// do ícone da Anthropic).
const BRAND_MATCH = [
  [/nubank/i, { icon: "nubank", bg: "#820AD1" }],
  [/picpay/i, { icon: "picpay", bg: "#21C25E" }],
  [/google/i, { icon: "google", bg: "#4285F4" }],
  [/claude|anthropic/i, { icon: "anthropic", bg: "#D97757" }],
  [/cartão caixa|\bcaixa\b/i, CAIXA_MARK],
  [/cartão c6|\bc6\b/i, C6_MARK],
];

// Sem ícone disponível, mas com cor oficial da marca reconhecível.
const FLAT_MATCH = [
  [/\b99pay\b|\b99\b/i, "#FFCC00"],
  [/canva/i, "#00C4CC"],
];

export function resolveBrand(name) {
  if (!name) return null;
  for (const [re, brand] of BRAND_MATCH) if (re.test(name)) return brand;
  for (const [re, bg] of FLAT_MATCH) if (re.test(name)) return { bg };
  return null;
}

// Paleta de categoria própria de finanças, escolhida com a skill de dataviz
// (references/palette.md) e revalidada com script (validate_palette.js:
// banda de luminância, piso de croma, separação CVD adjacente e "visão
// normal", nessa ordem fixa). Terceira versão (2026-09-08): a primeira leva
// passava em todos os testes técnicos mas tinha verde puro + rosa vivo
// dominando 94% da rosca, um clash feio. Tentei resolver dessaturando
// ("dusty"/muted) — o usuário mandou referências (WebIQ demo, gráfico de
// faixa etária) mostrando que o problema nunca foi saturação: ele queria
// cores VIVAS mesmo, só bem curadas (sem verde "sinal de trânsito" puro,
// sem rosa chiclete colidindo com ele). Essa versão volta pro vibrante,
// trocando só os dois tons problemáticos por equivalentes mais quentes —
// revalidada do zero, todos os 9 passam.
//
// Categorias que NUNCA aparecem juntas na mesma rosca (bills-only como
// "Dívida"/"Pessoal"/"Contas fixas", ou income-only como "Salário", que o
// gráfico de gastos exclui by design) reaproveitam a cor de uma categoria
// de despesa afim — sem risco real de confusão, já que nunca são fatias do
// mesmo gráfico ao mesmo tempo.
export const FINANCE_CATEGORY_COLORS = {
  Mercado: "#3ac0a0",
  Transporte: "#2e9bf0",
  Moradia: "#f5943a",
  Lazer: "#8c52e0",
  Saúde: "#e8483f",
  Educação: "#f0506e",
  Contas: "#de9e1e",
  "Pix / Pagamentos com cartão": "#6fc248",
  Assinaturas: "#4c5fd6",
  "Compras online": "#f5943a", // reaproveita Moradia
  "Contas fixas": "#de9e1e", // reaproveita Contas — bills-only, nunca na rosca
  Dívida: "#e8483f", // reaproveita Saúde — bills-only, nunca na rosca
  Pessoal: "#8c52e0", // reaproveita Lazer — bills-only, nunca na rosca
  Salário: "#6fc248", // reaproveita Pix — a rosca só mostra despesa, nunca colide
  Outros: "#8a8f98", // cinza neutro — é o "balde" de itens menores, não uma categoria de verdade
};

export function categoryColor(name) {
  return FINANCE_CATEGORY_COLORS[name] || "#6b7280";
}
