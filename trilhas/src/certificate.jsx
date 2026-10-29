import { useRef, useState } from 'react';
import { Mascot } from './art.jsx';
import { Icon } from './icons.jsx';
import { useProgress } from './store.jsx';
import { sequenceOf } from './practice.js';

// Certificado de conclusão de uma trilha: SVG com cores fixas (para exportar como PNG sem depender do tema do app).
const FONT = "'Nunito Variable', Nunito, 'Segoe UI', Arial, sans-serif";

const hashId = (s) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `TR-${h.toString(36).toUpperCase().padStart(7, '0').slice(0, 7)}`;
};

function CertSVG({ svgRef, track, name, date, certId, lessons, perfect }) {
  const c = track.color || '#7c5cff';
  const nameSize = name.length > 28 ? 40 : name.length > 18 ? 50 : 62;
  return (
    <svg ref={svgRef} className="cert-svg" viewBox="0 0 1000 700" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`Certificado de ${track.title}`}>
      <defs>
        <linearGradient id="cert-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fffdf8" /><stop offset="1" stopColor="#f3eeff" /></linearGradient>
        <linearGradient id="cert-band" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor={c} /><stop offset="1" stopColor="#ff6b9d" /></linearGradient>
      </defs>
      <rect width="1000" height="700" fill="url(#cert-bg)" />
      <rect x="22" y="22" width="956" height="656" rx="26" fill="none" stroke={c} strokeWidth="6" />
      <rect x="38" y="38" width="924" height="624" rx="18" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="3 8" opacity=".7" />
      <rect x="22" y="22" width="956" height="120" rx="26" fill="url(#cert-band)" />
      <rect x="22" y="100" width="956" height="42" fill="url(#cert-band)" />
      <g opacity=".18" fill="#fff"><circle cx="880" cy="40" r="90" /><circle cx="120" cy="150" r="60" /></g>
      <g transform="translate(60 34)"><Mascot size={104} /></g>
      <text x="500" y="84" textAnchor="middle" fontFamily={FONT} fontWeight="900" fontSize="46" letterSpacing="6" fill="#fff">CERTIFICADO</text>
      <text x="500" y="124" textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="20" letterSpacing="5" fill="#ffffffd9">DE CONCLUSÃO DE TRILHA</text>

      <text x="500" y="230" textAnchor="middle" fontFamily={FONT} fontSize="24" fill="#5d577f">Certificamos que</text>
      <text x="500" y="312" textAnchor="middle" fontFamily={FONT} fontWeight="900" fontSize={nameSize} fill="#1d1646">{name || 'Aluno(a) Trilhas'}</text>
      <rect x="260" y="330" width="480" height="4" rx="2" fill={c} opacity=".5" />
      <text x="500" y="384" textAnchor="middle" fontFamily={FONT} fontSize="24" fill="#5d577f">concluiu com êxito a trilha</text>
      <text x="500" y="456" textAnchor="middle" fontFamily={FONT} fontWeight="900" fontSize={track.title.length > 24 ? 46 : 60} fill={c}>{track.title}</text>
      <text x="500" y="506" textAnchor="middle" fontFamily={FONT} fontWeight="700" fontSize="22" fill="#5d577f">{lessons} lições concluídas{perfect ? ` · ${perfect} sem nenhum erro` : ''}</text>

      <g transform="translate(500 590)">
        <circle r="46" fill="#ffd34d" /><circle r="38" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="2 6" />
        <path d="M0 -22l6.5 14.6 15.9 1.7-11.9 10.7 3.4 15.6L0 11.4-13.9 22.6l3.4-15.6-11.9-10.7 15.9-1.7z" fill="#fff" />
      </g>
      <text x="120" y="602" fontFamily={FONT} fontWeight="800" fontSize="20" fill="#1d1646">{date}</text>
      <text x="120" y="628" fontFamily={FONT} fontSize="16" fill="#8a85ab">Data de conclusão</text>
      <text x="880" y="602" textAnchor="end" fontFamily="'Cascadia Code', Consolas, monospace" fontWeight="700" fontSize="20" fill="#1d1646">{certId}</text>
      <text x="880" y="628" textAnchor="end" fontFamily={FONT} fontSize="16" fill="#8a85ab">Código do certificado</text>
    </svg>
  );
}

async function toPng(svg) {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`; });
  const cv = document.createElement('canvas');
  cv.width = 2000; cv.height = 1400;
  cv.getContext('2d').drawImage(img, 0, 0, 2000, 1400);
  return new Promise((ok) => cv.toBlob(ok, 'image/png'));
}

export default function Certificate({ track, go }) {
  const { p, dispatch } = useProgress();
  const svgRef = useRef();
  const [name, setName] = useState(p.name || '');
  const [busy, setBusy] = useState('');
  const doneMap = p.done[track.id] || {};
  const complete = sequenceOf(track).every((id) => doneMap[id]);
  const lessons = track.chapters.flatMap((c) => c.lessons);
  const perfect = lessons.filter((l) => doneMap[l.id]?.perfect).length;
  const finishedAt = Math.max(0, ...lessons.map((l) => doneMap[l.id]?.at || 0)) || Date.now();
  const date = new Date(finishedAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  const certId = hashId(`${track.id}|${name}|${new Date(finishedAt).toISOString().slice(0, 10)}`);

  if (!complete) {
    return (
      <div className="page center">
        <Mascot mood="think" size={100} />
        <h2>Ainda falta um pouco</h2>
        <p className="muted">O certificado de <b>{track.title}</b> libera quando você concluir todas as lições e práticas da trilha.</p>
        <button className="btn primary" onClick={() => go(`/t/${track.id}`)}>Voltar à trilha</button>
      </div>
    );
  }

  const fileName = `certificado-${track.id}.png`;
  const blobNow = () => toPng(svgRef.current);
  const download = async () => {
    setBusy('download');
    try {
      const b = await blobNow();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } finally { setBusy(''); }
  };
  const share = async () => {
    setBusy('share');
    try {
      const b = await blobNow();
      const file = new File([b], fileName, { type: 'image/png' });
      const data = { files: [file], title: `Certificado — ${track.title}`, text: `Concluí a trilha ${track.title} no Trilhas!` };
      if (navigator.canShare?.(data)) await navigator.share(data);
      else if (navigator.share) await navigator.share({ title: data.title, text: data.text });
      else await download();
    } catch (e) { if (e?.name !== 'AbortError') await download(); } finally { setBusy(''); }
  };

  return (
    <div className="page cert-page">
      <div className="path-head">
        <button className="iconbtn" onClick={() => go(`/t/${track.id}`)} aria-label="Voltar"><Icon name="arrow-left" size={22} /></button>
        <b className="ph-title">Certificado</b>
      </div>
      <label className="field no-print"><span>Nome no certificado</span>
        <input value={name} maxLength={60} placeholder="Seu nome completo" onChange={(e) => setName(e.target.value)} onBlur={() => dispatch({ type: 'name', name })} />
      </label>
      <div className="cert-wrap">
        <CertSVG svgRef={svgRef} track={track} name={name.trim()} date={date} certId={certId} lessons={lessons.length} perfect={perfect} />
      </div>
      <div className="row gap no-print">
        <button className="btn primary" onClick={download} disabled={!!busy}><Icon name="download" size={18} /> Baixar PNG</button>
        <button className="btn ghost" onClick={share} disabled={!!busy}><Icon name="share" size={18} /> Compartilhar</button>
        <button className="btn ghost" onClick={() => window.print()}><Icon name="printer" size={18} /> Imprimir</button>
      </div>
    </div>
  );
}
