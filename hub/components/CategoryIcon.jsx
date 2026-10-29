"use client";

// Ícones de categoria — pictogramas genéricos simples (casa, carrinho,
// coração...), não logotipos de marca. Um por categoria, em branco, pra
// aparecer dentro do círculo colorido do avatar quando não há marca
// reconhecida (ver BrandAvatar em FinanceClient.jsx).
const ICONS = {
  Mercado: (
    <>
      <path d="M3 4h2l1.2 11.4A2 2 0 0 0 8.2 17H18a2 2 0 0 0 2-1.6L21.5 8H6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.5" cy="20.5" r="1.4" fill="#fff" />
      <circle cx="17" cy="20.5" r="1.4" fill="#fff" />
    </>
  ),
  Transporte: (
    <path d="M5 16.5V9.8a2 2 0 0 1 1.4-1.9L8 7.4a14 14 0 0 1 8 0l1.6.5A2 2 0 0 1 19 9.8v6.7M5 16.5a1.3 1.3 0 0 0 1.3 1.3h.4A1.3 1.3 0 0 0 8 16.5M5 16.5H4M19 16.5a1.3 1.3 0 0 1-1.3 1.3h-.4A1.3 1.3 0 0 1 16 16.5m3-0h1M7 12h10" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  ),
  Moradia: (
    <path d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5.5h4V20h3a1 1 0 0 0 1-1v-9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  Lazer: (
    <path d="M12 3.5l2.02 4.3 4.73.63-3.5 3.28.9 4.7L12 14.1l-4.15 2.31.9-4.7-3.5-3.28 4.73-.63L12 3.5z" fill="#fff" />
  ),
  Saúde: (
    <path d="M12 20.2S3.7 15.3 3.7 9.3A4 4 0 0 1 12 7.8a4 4 0 0 1 8.3 1.5c0 6-8.3 10.9-8.3 10.9z" fill="#fff" />
  ),
  Contas: (
    <path d="M6 3h12v17.2l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2V3zm2.5 5h7M8.5 11h7M8.5 14h4.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  ),
  "Contas fixas": (
    <path d="M17.5 6.5A6.5 6.5 0 0 0 6.2 8.7M6.5 17.5a6.5 6.5 0 0 0 11.3-2.2M17.5 6.5V3m0 3.5h-3.5M6.5 17.5V21m0-3.5H10" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
  Salário: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" fill="none" stroke="#fff" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.4" fill="none" stroke="#fff" strokeWidth="1.6" />
    </>
  ),
  Outros: (
    <>
      <circle cx="6" cy="12" r="1.7" fill="#fff" />
      <circle cx="12" cy="12" r="1.7" fill="#fff" />
      <circle cx="18" cy="12" r="1.7" fill="#fff" />
    </>
  ),
  Educação: (
    <path d="M12 4 2 8.5 12 13l8.2-3.75V15M6 10.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-5.5" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  ),
  "Pix / Pagamentos com cartão": (
    <path d="M12.9 2.5 4.6 13.2h5.1L11.1 21.5 19.4 10.8h-5.1L12.9 2.5z" fill="#fff" />
  ),
  Assinaturas: (
    <path d="M18.4 7A6.5 6.5 0 1 0 19.8 14M19.8 14h-4M19.8 14v4" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  ),
  "Compras online": (
    <path d="M7 8V6.5a5 5 0 0 1 10 0V8m-12.5 0h15l-1 12.5a1.5 1.5 0 0 1-1.5 1.4H7.5A1.5 1.5 0 0 1 6 20.5L5 8z" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  ),
  Dívida: (
    <path d="M12 3 2 20.5h20L12 3zm0 6.5v4.3M12 17.3v.1" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  ),
  Pessoal: (
    <path d="M12 12.5a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4zm-7 8.3c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  ),
};

export function hasCategoryIcon(name) {
  return Boolean(name && ICONS[name]);
}

export default function CategoryIcon({ name, className }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {icon}
    </svg>
  );
}
