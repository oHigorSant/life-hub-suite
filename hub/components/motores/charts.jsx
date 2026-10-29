"use client";

// Gráficos em SVG puro (sem bibliotecas): anel de medidor, rosca de participação, barras empilhadas, área e barras horizontais.
export const COLORS = { claude: "#d97757", gemini: "#4285f4", openrouter: "#8b5cf6" };
const MUTED = "rgba(0,0,0,.08)";

/** Anel de medidor (0-100) com valor no centro. */
export function Gauge({ value, label, sub, color = COLORS.claude, size = 132, display }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const r = 52, c = 2 * Math.PI * r;
  const tone = v >= 90 ? "#ff3b30" : v >= 70 ? "#ff9f0a" : color;
  return (
    <figure className="ch-gauge" style={{ width: size }}>
      <svg viewBox="0 0 132 132" width={size} height={size} role="img" aria-label={`${label}: ${display ?? v + "%"}`}>
        <circle cx="66" cy="66" r={r} fill="none" stroke={MUTED} strokeWidth="12" />
        <circle cx="66" cy="66" r={r} fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform="rotate(-90 66 66)" style={{ transition: "stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)" }} />
        <text x="66" y="66" textAnchor="middle" dominantBaseline="central" className="ch-gauge-val">{display ?? `${Math.round(v)}%`}</text>
      </svg>
      <figcaption><b>{label}</b>{sub && <span>{sub}</span>}</figcaption>
    </figure>
  );
}

/** Rosca de participação. slices: [{ label, value, color }] */
export function Donut({ slices, center, size = 150 }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = 52, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="ch-donut">
      <svg viewBox="0 0 132 132" width={size} height={size} role="img" aria-label="Participação de cada IA">
        <circle cx="66" cy="66" r={r} fill="none" stroke={MUTED} strokeWidth="16" />
        {total > 0 && slices.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * c;
          const el = <circle key={s.label} cx="66" cy="66" r={r} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-acc} transform="rotate(-90 66 66)" />;
          acc += len;
          return el;
        })}
        <text x="66" y="62" textAnchor="middle" className="ch-donut-n">{center ?? total}</text>
        <text x="66" y="80" textAnchor="middle" className="ch-donut-s">pedidos</text>
      </svg>
      <ul>{slices.map((s) => <li key={s.label}><i style={{ background: s.color }} />{s.label}<b>{total ? Math.round((s.value / total) * 100) : 0}%</b><em>{s.value}</em></li>)}</ul>
    </div>
  );
}

/** Barras empilhadas por dia. days: [{ label, parts: [{ key, value, color }] }] */
export function StackedBars({ days, legend, height = 190 }) {
  const W = 560, H = height, padL = 30, padB = 26, padT = 10;
  const max = Math.max(1, ...days.map((d) => d.parts.reduce((s, p) => s + p.value, 0)));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p; })();
  const bw = Math.min(44, ((W - padL) / days.length) * 0.58);
  const step = (W - padL) / days.length;
  const y = (v) => padT + (H - padT - padB) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  return (
    <div className="ch-bars">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Pedidos por dia">
        {ticks.map((t) => (<g key={t}><line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="rgba(0,0,0,.07)" /><text x={padL - 6} y={y(t) + 4} textAnchor="end" className="ch-axis">{Math.round(t)}</text></g>))}
        {days.map((d, i) => {
          let base = 0;
          const x = padL + i * step + (step - bw) / 2;
          return (
            <g key={d.label}>
              {d.parts.map((p) => { const h = (H - padT - padB) * (p.value / nice); const rect = h > 0 ? <rect key={p.key} x={x} y={y(base + p.value)} width={bw} height={h} fill={p.color} rx={h > 6 ? 4 : 1}><title>{`${p.key}: ${p.value}`}</title></rect> : null; base += p.value; return rect; })}
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="ch-axis">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {legend && <ul className="ch-legend">{legend.map((l) => <li key={l.label}><i style={{ background: l.color }} />{l.label}</li>)}</ul>}
    </div>
  );
}

/** Gráfico de área simples. points: [{ label, value }] */
export function AreaChart({ points, color = COLORS.openrouter, format = (v) => v, height = 150 }) {
  const W = 560, H = height, padL = 6, padR = 6, padT = 14, padB = 24;
  const max = Math.max(...points.map((p) => p.value), 0.0001);
  const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (points.length - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;
  const gid = `ar-${color.replace("#", "")}`;
  return (
    <svg className="ch-area" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolução diária">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".35" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <line x1={padL} x2={W - padR} y1={H - padB} y2={H - padB} stroke="rgba(0,0,0,.08)" />
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (<g key={p.label}><circle cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke={color} strokeWidth="2"><title>{`${p.label}: ${format(p.value)}`}</title></circle><text x={x(i)} y={H - 7} textAnchor="middle" className="ch-axis">{p.label}</text></g>))}
    </svg>
  );
}

/** Barras horizontais. rows: [{ label, value, sub, color }] */
export function HBars({ rows, format = (v) => v }) {
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <ul className="ch-hbars">
      {rows.map((r) => (
        <li key={r.label}>
          <div><span>{r.label}</span><b>{format(r.value)}</b></div>
          <div className="ch-hbar"><i style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: r.color || COLORS.openrouter }} /></div>
          {r.sub && <small>{r.sub}</small>}
        </li>
      ))}
    </ul>
  );
}
