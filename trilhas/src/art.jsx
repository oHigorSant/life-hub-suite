import { Icon } from './icons.jsx';

/* ---------- Mascote "Byte": robô-blob com tela no rosto ---------- */
export function Mascot({ mood = 'happy', size = 96, className = '' }) {
  const m = '#8dffc9'; // cor do brilho do rosto
  const eyes = {
    happy: <><path d="M38 58q7-9 14 0M68 58q7-9 14 0" stroke={m} strokeWidth="5" fill="none" strokeLinecap="round" /></>,
    wow: <><circle cx="45" cy="57" r="8" fill={m} /><circle cx="75" cy="57" r="8" fill={m} /><circle cx="47" cy="54" r="2.6" fill="#241a5e" /><circle cx="77" cy="54" r="2.6" fill="#241a5e" /></>,
    sad: <><path d="M37 60q7 8 14 0M69 60q7 8 14 0" stroke={m} strokeWidth="5" fill="none" strokeLinecap="round" /><path d="M36 48l16 5M84 48l-16 5" stroke={m} strokeWidth="3" strokeLinecap="round" opacity=".7" /></>,
    think: <><circle cx="45" cy="56" r="7" fill={m} /><circle cx="75" cy="56" r="7" fill={m} /><circle cx="48" cy="53" r="2.6" fill="#241a5e" /><circle cx="78" cy="53" r="2.6" fill="#241a5e" /></>,
  };
  const mouth = {
    happy: <path d="M50 70q10 9 20 0" stroke={m} strokeWidth="4.5" fill="none" strokeLinecap="round" />,
    wow: <ellipse cx="60" cy="74" rx="6" ry="7.5" fill={m} />,
    sad: <path d="M51 77q9-8 18 0" stroke={m} strokeWidth="4.5" fill="none" strokeLinecap="round" />,
    think: <path d="M54 74h14" stroke={m} strokeWidth="4.5" fill="none" strokeLinecap="round" />,
  };
  const up = mood === 'wow';
  return (
    <svg className={`mascot ${mood} ${className}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id="mb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#ddd5ff" /></linearGradient>
        <radialGradient id="bulb" cx=".4" cy=".35"><stop offset="0" stopColor="#fff6b0" /><stop offset="1" stopColor="#ffc531" /></radialGradient>
      </defs>
      <ellipse cx="60" cy="112" rx="32" ry="5" fill="#000" opacity=".16" />
      {up ? (
        <><path d="M16 66q-12-12-8-28" stroke="#d4caff" strokeWidth="9" fill="none" strokeLinecap="round" /><path d="M104 66q12-12 8-28" stroke="#d4caff" strokeWidth="9" fill="none" strokeLinecap="round" /></>
      ) : (
        <><ellipse cx="13" cy="76" rx="8" ry="11" fill="#d4caff" transform="rotate(14 13 76)" /><ellipse cx="107" cy="76" rx="8" ry="11" fill="#d4caff" transform="rotate(-14 107 76)" /></>
      )}
      <ellipse cx="42" cy="106" rx="11" ry="6" fill="#cfc4ff" /><ellipse cx="78" cy="106" rx="11" ry="6" fill="#cfc4ff" />
      <path d="M60 14C94 14 110 40 110 68C110 96 92 108 60 108C28 108 10 96 10 68C10 40 26 14 60 14Z" fill="url(#mb)" stroke="#c4b8ff" strokeWidth="2.5" />
      <path d="M26 38q8-14 26-18" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".9" />
      <ellipse cx="60" cy="63" rx="38" ry="28" fill="#241a5e" />
      <ellipse cx="60" cy="63" rx="38" ry="28" fill="none" stroke="#3a2d86" strokeWidth="2" />
      <ellipse cx="30" cy="72" rx="6" ry="4" fill="#ff7fb0" opacity=".55" /><ellipse cx="90" cy="72" rx="6" ry="4" fill="#ff7fb0" opacity=".55" />
      {eyes[mood] || eyes.happy}
      {mouth[mood] || mouth.happy}
      <path d="M60 15v-9" stroke="#c4b8ff" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="6" r="6.5" fill="url(#bulb)" /><circle cx="60" cy="6" r="10" fill="#ffd34d" opacity=".25" />
    </svg>
  );
}

/* ---------- Arte decorativa dos capítulos (formas brancas sobre o fundo colorido) ---------- */
const W = '#fff';
export function ChapterArt({ kind = 'spark', className = '' }) {
  const art = {
    table: (<>
      <rect x="22" y="18" width="116" height="78" rx="12" fill={W} opacity=".18" />
      <rect x="22" y="18" width="116" height="20" rx="10" fill={W} opacity=".85" />
      {[46, 64, 82].map((y, i) => <rect key={y} x="30" y={y} width="100" height="10" rx="5" fill={W} opacity={i === 1 ? 0.75 : 0.3} />)}
      <circle cx="132" cy="28" r="3" fill="#7c5cff" /><circle cx="122" cy="28" r="3" fill="#7c5cff" opacity=".5" />
    </>),
    filter: (<>
      <path d="M26 18h108L92 62v30l-24 10V62Z" fill={W} opacity=".85" strokeLinejoin="round" />
      {[[40, 8], [62, 4], [84, 9], [104, 5], [122, 10]].map(([x, y], i) => <circle key={i} cx={x} cy={y + 2} r="4" fill={W} opacity=".5" />)}
      <circle cx="80" cy="106" r="4" fill={W} /><circle cx="90" cy="98" r="3" fill={W} opacity=".6" />
    </>),
    sort: (<>
      {[28, 44, 60, 76, 92].map((h, i) => <rect key={i} x={26 + i * 26} y={104 - h - 6} width="18" height={h} rx="6" fill={W} opacity={0.35 + i * 0.15} />)}
      <path d="M30 22q50-20 100 6" stroke={W} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M122 14l10 14-17 4" stroke={W} strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>),
    chart: (<>
      <rect x="18" y="14" width="124" height="88" rx="14" fill={W} opacity=".15" />
      {[30, 52, 40, 66].map((h, i) => <rect key={i} x={34 + i * 26} y={92 - h} width="16" height={h} rx="5" fill={W} opacity=".7" />)}
      <path d="M30 66l28-18 24 12 40-34" stroke="#ffd34d" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="122" cy="26" r="6" fill="#ffd34d" />
    </>),
    join: (<>
      <circle cx="64" cy="58" r="38" fill={W} opacity=".55" />
      <circle cx="100" cy="58" r="38" fill={W} opacity=".4" />
      <path d="M82 25a38 38 0 0 1 0 66a38 38 0 0 1 0-66Z" fill={W} opacity=".95" />
    </>),
    pencil: (<>
      {[26, 46, 66, 86].map((y, i) => <rect key={y} x="18" y={y} width={92 - i * 8} height="12" rx="6" fill={W} opacity={i === 1 ? 0.85 : 0.35} />)}
      <g transform="rotate(38 118 56)"><rect x="108" y="14" width="18" height="70" rx="5" fill="#ffd34d" /><path d="M108 84h18l-9 18Z" fill={W} /><rect x="108" y="14" width="18" height="12" rx="5" fill="#ff7fb0" /></g>
    </>),
    nested: (<>
      <rect x="20" y="10" width="120" height="96" rx="18" fill={W} opacity=".2" />
      <rect x="38" y="26" width="84" height="64" rx="14" fill={W} opacity=".35" />
      <rect x="56" y="42" width="48" height="32" rx="10" fill={W} opacity=".9" />
    </>),
    window: (<>
      <rect x="18" y="26" width="104" height="74" rx="12" fill={W} opacity=".25" transform="rotate(-6 70 63)" />
      <rect x="36" y="18" width="104" height="74" rx="12" fill={W} opacity=".9" />
      <rect x="36" y="18" width="104" height="18" rx="10" fill="#fff" />
      {[46, 60, 74].map((y) => <rect key={y} x="46" y={y} width="76" height="7" rx="3.5" fill="#7c5cff" opacity=".35" />)}
    </>),
    spark: (<>
      <path d="M80 12l9 28 28 9-28 9-9 28-9-28-28-9 28-9Z" fill={W} opacity=".9" />
      <circle cx="30" cy="30" r="7" fill={W} opacity=".4" /><circle cx="132" cy="84" r="9" fill={W} opacity=".35" /><circle cx="128" cy="26" r="4" fill={W} opacity=".6" />
      <path d="M28 88l5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" fill={W} opacity=".55" transform="scale(.6) translate(10 40)" />
    </>),
    wave: (<>
      {[0, 1, 2].map((i) => <path key={i} d={`M10 ${40 + i * 24}q35-30 70 0t70 0`} stroke={W} strokeWidth="7" fill="none" strokeLinecap="round" opacity={0.85 - i * 0.25} />)}
    </>),
    dots: (<>
      {Array.from({ length: 15 }, (_, i) => <circle key={i} cx={24 + (i % 5) * 28} cy={26 + Math.floor(i / 5) * 28} r={i % 4 === 0 ? 8 : 5} fill={W} opacity={i % 4 === 0 ? 0.9 : 0.4} />)}
    </>),
  };
  return <svg className={`chart-art ${className}`} viewBox="0 0 160 112" aria-hidden="true">{art[kind] || art.spark}</svg>;
}

export const CHAPTER_KIND = { basico: 'table', filtrando: 'filter', ordenando: 'sort', agregacoes: 'chart', joins: 'join', modificando: 'pencil', subconsultas: 'nested', avancado: 'window' };
const FALLBACK = ['spark', 'wave', 'dots'];
export const kindFor = (chapter, index) => CHAPTER_KIND[chapter.id] || FALLBACK[index % FALLBACK.length];

/* ---------- Cena de destaque da tela inicial ---------- */
export function HeroArt() {
  return (
    <div className="hero">
      <svg className="hero-bg" viewBox="0 0 360 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7c5cff" /><stop offset=".6" stopColor="#a259ff" /><stop offset="1" stopColor="#ff6b9d" /></linearGradient>
          <pattern id="hd" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#fff" opacity=".22" /></pattern>
        </defs>
        <rect width="360" height="170" fill="url(#hg)" /><rect width="360" height="170" fill="url(#hd)" />
        <circle cx="318" cy="22" r="46" fill="#fff" opacity=".1" /><circle cx="30" cy="160" r="60" fill="#fff" opacity=".08" />
        {/* pilha de banco de dados (atrás do mascote) */}
        <g transform="translate(286 84) scale(.62)">
          {[0, 26, 52].map((y, i) => (
            <g key={y}>
              <path d={`M0 ${y + 10}v16a38 12 0 0 0 76 0v-16`} fill="#fff" opacity={0.95 - i * 0.12} />
              <ellipse cx="38" cy={y + 10} rx="38" ry="12" fill="#fff" />
              <circle cx="62" cy={y + 24} r="2.6" fill="#2bb673" />
            </g>
          ))}
        </g>
        {/* cartão de tabela flutuante */}
        <g className="float" transform="translate(272 12) rotate(-8) scale(.8)">
          <rect width="64" height="46" rx="9" fill="#fff" /><rect width="64" height="13" rx="7" fill="#ffd34d" />
          {[20, 29, 38].map((y, i) => <rect key={y} x="8" y={y} width={48 - i * 10} height="4.5" rx="2.2" fill="#7c5cff" opacity={0.55 - i * 0.12} />)}
        </g>
        <text x="18" y="156" fontFamily="ui-monospace, Consolas, monospace" fontWeight="800" fontSize="26" fill="#fff" opacity=".55">{'{ }'}</text>
        <path d="M196 132l5 12 12 5-12 5-5 12-5-12-12-5 12-5Z" transform="scale(.55) translate(250 140)" fill="#ffd34d" />
        <path d="M200 20l4 9 9 4-9 4-4 9-4-9-9-4 9-4Z" fill="#fff" opacity=".8" />
      </svg>
      <Mascot size={132} className="hero-mascot bob" />
    </div>
  );
}

/* ---------- Raios de vitória atrás do mascote ---------- */
export function Burst({ children, size = 220 }) {
  return (
    <div className="burst" style={{ width: size, height: size }}>
      <svg viewBox="-100 -100 200 200" className="rays" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => <path key={i} d="M0 0L-14 -100H14Z" fill="#ffd34d" opacity={i % 2 ? 0.16 : 0.3} transform={`rotate(${i * 30})`} />)}
        <circle r="62" fill="#ffd34d" opacity=".22" />
      </svg>
      <div className="burst-in">{children}</div>
    </div>
  );
}

/* ---------- Ladrilho colorido do ícone de uma trilha ---------- */
export function TrackTile({ icon, color, size = 64 }) {
  return (
    <div className="ttile" style={{ width: size, height: size, '--c': color }}>
      <svg viewBox="0 0 64 64" className="ttile-bg" aria-hidden="true"><circle cx="54" cy="10" r="20" fill="#fff" opacity=".16" /><circle cx="6" cy="62" r="18" fill="#000" opacity=".1" /></svg>
      <Icon name={icon} size={size * 0.5} stroke={2.2} />
    </div>
  );
}
