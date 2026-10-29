"use client";
// Ícones vetoriais do app (lucide). Um lugar só para manter o padrão visual.
import {
  BookOpen, Bookmark, PenLine, Target, Layers, Headphones, Timer, Hammer,
  Network, Library, LineChart, MessagesSquare, Trash2, Plus, ArrowRight, ArrowLeft, RefreshCw,
  Sparkles, Lock, Check, CheckCircle2, AlertTriangle, HelpCircle, Lightbulb, Rocket, Paperclip, Search,
  FileText, FileType2, Image as ImageIcon, Mic, Film, Link2, File, Clock, BrickWall, Sprout, BrainCircuit,
  PartyPopper, Play, Pause, SlidersHorizontal, X, Download, GalleryVerticalEnd, MapPin, CircleDashed, CircleX, Upload,
} from "lucide-react";

export {
  BookOpen, Bookmark, PenLine, Target, Layers, Headphones, Timer, Hammer, Network, Library, LineChart, MessagesSquare,
  Trash2, Plus, ArrowRight, ArrowLeft, RefreshCw, Sparkles, Lock, Check, CheckCircle2, AlertTriangle, HelpCircle, Lightbulb,
  Rocket, Paperclip, Search, FileText, FileType2, ImageIcon, Mic, Film, Link2, File, Clock, BrickWall, Sprout, BrainCircuit,
  PartyPopper, Play, Pause, SlidersHorizontal, X, Download, GalleryVerticalEnd, MapPin, CircleDashed, CircleX, Upload,
};

export const ACTIVITY_ICON = { lesson: BookOpen, reading: Bookmark, exercise: PenLine, quiz: Target, flashcards: Layers, podcast: Headphones, mock: Timer, project: Hammer };
export const SOURCE_ICON = { pdf: FileType2, text: FileText, image: ImageIcon, audio: Mic, video: Film, url: Link2 };

export function ActivityIcon({ type, size = 18, ...rest }) {
  const I = ACTIVITY_ICON[type] || BookOpen;
  return <I size={size} strokeWidth={2} {...rest} />;
}

/** Ilustração vetorial: constelação/árvore de nós (estados vazios e de construção). */
export function TreeIllustration({ size = 120, animated = false }) {
  const nodes = [[60, 18], [30, 52], [90, 52], [16, 92], [46, 92], [76, 92], [104, 92]];
  const links = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]];
  return (
    <svg width={size} height={size} viewBox="0 0 120 110" className={animated ? "illu animated" : "illu"} aria-hidden>
      <defs>
        <linearGradient id="illuG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient>
        <radialGradient id="illuGlow"><stop offset="0" stopColor="#8b5cf6" stopOpacity="0.35" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="60" cy="58" r="56" fill="url(#illuGlow)" />
      {links.map(([a, b], i) => {
        const [x1, y1] = nodes[a], [x2, y2] = nodes[b];
        const my = (y1 + y2) / 2;
        return <path key={i} d={`M${x1},${y1} L${x1},${my} L${x2},${my} L${x2},${y2}`} fill="none" stroke="url(#illuG)" strokeWidth="2" strokeLinejoin="round" opacity="0.7" className="illu-link" style={{ animationDelay: `${i * 0.15}s` }} />;
      })}
      {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i === 0 ? 8 : 6} fill="var(--node-card)" stroke="url(#illuG)" strokeWidth="2.5" className="illu-node" style={{ animationDelay: `${i * 0.12}s` }} />)}
      <circle cx="60" cy="18" r="3" fill="#fbbf24" />
    </svg>
  );
}

/** Ilustração: pilha de documentos com faísca (biblioteca / material). */
export function DocsIllustration({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <defs><linearGradient id="docG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
      <rect x="22" y="16" width="44" height="58" rx="7" fill="var(--node-locked-card)" stroke="var(--node-idle-line)" transform="rotate(-8 44 45)" />
      <rect x="30" y="20" width="44" height="58" rx="7" fill="var(--node-card)" stroke="url(#docG)" strokeWidth="2" />
      {[34, 42, 50, 58].map((y, i) => <rect key={y} x="38" y={y} width={i === 3 ? 18 : 28} height="3.5" rx="1.75" fill="var(--illu-line)" />)}
      <path d="M76 18 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" fill="#fbbf24" />
    </svg>
  );
}
