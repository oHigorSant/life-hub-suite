"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { norm } from "@/lib/notas/parse.js";

/** [[nota]] -> link interno, #tag -> filtro, @Nome -> menção (só se existir uma nota com esse nome). Não mexe em código. */
export function preprocess(body, titles) {
  const parts = String(body ?? "").split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((p, i) => {
      if (i % 2) return p;
      return p
        .replace(/\[\[([^\]|#\n]+)(#[^\]|\n]*)?(?:\|([^\]\n]*))?\]\]/g, (_m, name, _anchor, alias) => `[${(alias || name).trim()}](nota:${encodeURIComponent(name.trim())})`)
        .replace(/(^|[\s(])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu, (_m, pre, t) => `${pre}[#${t}](tag:${encodeURIComponent(t.toLowerCase())})`)
        .replace(/(^|[\s(])@(?:"([^"\n]+)"|([\p{L}\p{N}_][\p{L}\p{N}_\-]*))/gu, (m, pre, q, w) => {
          const n = (q || w).trim();
          return titles.has(norm(n)) ? `${pre}[@${n}](nota:${encodeURIComponent(n)})` : m;
        });
    })
    .join("");
}

export default function Markdown({ text, titles, onOpenNote, onTag }) {
  const src = preprocess(text, titles);
  return (
    <div className="nt-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(u) => u}
        components={{
          a: ({ href = "", children }) => {
            if (href.startsWith("nota:")) {
              const name = decodeURIComponent(href.slice(5));
              const exists = titles.has(norm(name));
              return (
                <a href="#" className={`nt-wikilink${exists ? "" : " missing"}`} title={exists ? name : `${name} (ainda não existe — clique para criar)`} onClick={(e) => { e.preventDefault(); onOpenNote?.(name); }}>
                  {children}
                </a>
              );
            }
            if (href.startsWith("tag:")) {
              const t = decodeURIComponent(href.slice(4));
              return (
                <a href="#" className="nt-tagpill" onClick={(e) => { e.preventDefault(); onTag?.(t); }}>
                  {children}
                </a>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          table: ({ children }) => <div className="nt-table-wrap"><table>{children}</table></div>,
        }}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}
