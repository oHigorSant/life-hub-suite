"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X, Copy } from "lucide-react";
import { SHAPES, LAYOUTS, ICONS, BORDERS } from "@/lib/notas/views.js";

const SHAPE_LABEL = { ellipse: "círculo", "round-rectangle": "retângulo arredondado", rectangle: "retângulo", diamond: "losango", hexagon: "hexágono", octagon: "octógono", star: "estrela", triangle: "triângulo", pentagon: "pentágono", tag: "etiqueta", "round-tag": "etiqueta arredondada", vee: "seta", barrel: "barril" };
const LAYOUT_LABEL = { fcose: "Força (compostos)", cose: "Força clássica", concentric: "Concêntrico (por conexões)", breadthfirst: "Árvore", circle: "Círculo", grid: "Grade" };
const ICON_LABEL = { "file-text": "documento", server: "servidor", cpu: "chip", database: "banco de dados", globe: "globo", code: "código", terminal: "terminal", shield: "escudo", book: "livro", star: "estrela", flag: "bandeira", folder: "pasta", layers: "camadas", zap: "raio", cloud: "nuvem", lock: "cadeado", bug: "bug", brain: "cérebro" };
const BORDER_LABEL = { solid: "contínua", dashed: "tracejada", dotted: "pontilhada", double: "dupla" };
const WHEN_KINDS = [["area", "Área"], ["tag", "Tag"], ["type", "Tipo"], ["text", "Título contém"], ["minDegree", "Conexões ≥"]];

function toggle(list, v) { return list.includes(v) ? list.filter((x) => x !== v) : [...list, v]; }

export default function ViewEditor({ view, graph, areaOptions, onChange, onSave, onClose, onDuplicate, onDelete, canDelete }) {
  const [d, setD] = useState(view);
  useEffect(() => setD(view), [view.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(fn) {
    setD((cur) => {
      const next = structuredClone(cur);
      fn(next);
      onChange?.(next);
      return next;
    });
  }

  const noteChoices = useMemo(() => graph.nodes.map((n) => ({ id: n.id, title: n.title })).sort((a, b) => a.title.localeCompare(b.title)), [graph]);

  return (
    <aside className="gf-editor">
      <div className="gf-editor-head">
        <strong>Editar visão</strong>
        <button type="button" className="nt-btn" onClick={onClose} aria-label="Fechar"><X size={15} /></button>
      </div>

      <div className="gf-editor-body">
        <label className="gf-field">Nome
          <input value={d.name} onChange={(e) => patch((v) => { v.name = e.target.value; })} />
        </label>
        <label className="gf-field">Descrição
          <input value={d.description} onChange={(e) => patch((v) => { v.description = e.target.value; })} />
        </label>

        <h4>Filtro</h4>
        <div className="gf-field">Áreas
          <div className="gf-checks">
            {areaOptions.length === 0 && <em>Nenhuma área ainda (use o campo "area:" nas notas).</em>}
            {areaOptions.map((a) => (
              <label key={a.id}><input type="checkbox" checked={d.filter.areas.includes(a.label) || d.filter.areas.includes(a.id)} onChange={() => patch((v) => { const has = v.filter.areas.includes(a.label) || v.filter.areas.includes(a.id); v.filter.areas = has ? v.filter.areas.filter((x) => x !== a.label && x !== a.id) : [...v.filter.areas, a.label]; })} /> {a.label}</label>
            ))}
          </div>
        </div>
        <label className="gf-inline"><input type="checkbox" checked={d.filter.includeDescendants} onChange={(e) => patch((v) => { v.filter.includeDescendants = e.target.checked; })} /> Incluir áreas filhas</label>

        <div className="gf-field">Tags
          <div className="nt-chips">
            {graph.tags.length === 0 && <em>Sem tags.</em>}
            {graph.tags.map((t) => (
              <button key={t.tag} type="button" className={`nt-chip${d.filter.tags.includes(t.tag) ? " on" : ""}`} onClick={() => patch((v) => { v.filter.tags = toggle(v.filter.tags, t.tag); })}>#{t.tag} <em>{t.count}</em></button>
            ))}
          </div>
        </div>
        <label className="gf-field">Combinar tags
          <select value={d.filter.tagMode} onChange={(e) => patch((v) => { v.filter.tagMode = e.target.value; })}>
            <option value="any">qualquer uma</option>
            <option value="all">todas</option>
          </select>
        </label>

        <div className="gf-field">Tipos
          <div className="nt-chips">
            {graph.types.map((t) => (
              <button key={t} type="button" className={`nt-chip${d.filter.types.includes(t) ? " on" : ""}`} onClick={() => patch((v) => { v.filter.types = toggle(v.filter.types, t); })}>{t}</button>
            ))}
          </div>
        </div>

        <label className="gf-field">Título contém
          <input value={d.filter.text} onChange={(e) => patch((v) => { v.filter.text = e.target.value; })} />
        </label>
        <label className="gf-field">Focar em uma nota
          <select value={d.filter.focus} onChange={(e) => patch((v) => { v.filter.focus = e.target.value; })}>
            <option value="">(nenhuma)</option>
            {noteChoices.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
          </select>
        </label>
        {d.filter.focus && (
          <label className="gf-field">Níveis a partir dela: {d.filter.depth}
            <input type="range" min="1" max="6" value={d.filter.depth} onChange={(e) => patch((v) => { v.filter.depth = Number(e.target.value); })} />
          </label>
        )}
        <label className="gf-inline"><input type="checkbox" checked={d.filter.hideOrphans} onChange={(e) => patch((v) => { v.filter.hideOrphans = e.target.checked; })} /> Ocultar notas sem conexões</label>
        <label className="gf-inline"><input type="checkbox" checked={!d.filter.hideGhosts} onChange={(e) => patch((v) => { v.filter.hideGhosts = !e.target.checked; })} /> Mostrar links para notas inexistentes</label>

        <h4>Relações e agrupamento</h4>
        <label className="gf-inline"><input type="checkbox" checked={d.show.links} onChange={(e) => patch((v) => { v.show.links = e.target.checked; })} /> Links [[ ]]</label>
        <label className="gf-inline"><input type="checkbox" checked={d.show.mentions} onChange={(e) => patch((v) => { v.show.mentions = e.target.checked; })} /> Menções @</label>
        <label className="gf-inline"><input type="checkbox" checked={d.show.tags} onChange={(e) => patch((v) => { v.show.tags = e.target.checked; })} /> Tags como nós</label>
        <label className="gf-inline"><input type="checkbox" checked={d.show.hierarchy} onChange={(e) => patch((v) => { v.show.hierarchy = e.target.checked; })} /> Hierarquia de áreas como nós e ligações</label>
        <label className="gf-inline"><input type="checkbox" checked={d.show.labels} onChange={(e) => patch((v) => { v.show.labels = e.target.checked; })} /> Mostrar nomes</label>
        <label className="gf-field">Agrupar (delimitações)
          <select value={d.group} onChange={(e) => patch((v) => { v.group = e.target.value; })}>
            <option value="none">sem agrupar</option>
            <option value="area">por área (hierarquia aninhada)</option>
            <option value="tag">por tag</option>
          </select>
        </label>

        <h4>Aparência</h4>
        <label className="gf-field">Cor dos nós por
          <select value={d.style.nodeColorBy} onChange={(e) => patch((v) => { v.style.nodeColorBy = e.target.value; })}>
            <option value="area">área</option><option value="tag">primeira tag</option><option value="type">tipo</option><option value="fixed">cor fixa</option>
          </select>
        </label>
        {d.style.nodeColorBy === "fixed" && (
          <label className="gf-field">Cor fixa <input type="color" value={d.style.fixedColor} onChange={(e) => patch((v) => { v.style.fixedColor = e.target.value; })} /></label>
        )}
        <label className="gf-field">Forma dos nós por
          <select value={d.style.nodeShapeBy} onChange={(e) => patch((v) => { v.style.nodeShapeBy = e.target.value; })}>
            <option value="none">círculo para todos</option><option value="type">tipo</option><option value="area">área</option>
          </select>
        </label>
        <label className="gf-field">Tamanho por
          <select value={d.style.sizeBy} onChange={(e) => patch((v) => { v.style.sizeBy = e.target.value; })}>
            <option value="fixed">fixo</option><option value="degree">conexões</option><option value="words">palavras</option>
          </select>
        </label>
        <div className="gf-row2">
          <label className="gf-field">Linhas <input type="color" value={d.style.edgeColor} onChange={(e) => patch((v) => { v.style.edgeColor = e.target.value; })} /></label>
          <label className="gf-field">Fundo <input type="color" value={d.style.background} onChange={(e) => patch((v) => { v.style.background = e.target.value; })} /></label>
        </div>
        <label className="gf-field">Disposição
          <select value={d.layout} onChange={(e) => patch((v) => { v.layout = e.target.value; })}>
            {LAYOUTS.map((l) => <option key={l} value={l}>{LAYOUT_LABEL[l]}</option>)}
          </select>
        </label>

        <h4>Regras visuais</h4>
        <p className="gf-hint">Aplicadas em ordem, sobre as cores automáticas. Ex.: tag "back-end" vira hexágono vermelho com ícone de servidor.</p>
        {d.rules.map((r, i) => {
          const kind = WHEN_KINDS.map((k) => k[0]).find((k) => r.when[k] !== undefined) || "tag";
          return (
            <div key={i} className="gf-rule">
              <div className="gf-rule-when">
                <select value={kind} onChange={(e) => patch((v) => { const val = v.rules[i].when[kind]; v.rules[i].when = { [e.target.value]: e.target.value === "minDegree" ? 1 : (val ?? "") }; })}>
                  {WHEN_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                {kind === "area" ? (
                  <select value={r.when.area ?? ""} onChange={(e) => patch((v) => { v.rules[i].when = { area: e.target.value }; })}>
                    <option value="">(escolha)</option>
                    {areaOptions.map((a) => <option key={a.id} value={a.label}>{a.label}</option>)}
                  </select>
                ) : kind === "tag" ? (
                  <select value={r.when.tag ?? ""} onChange={(e) => patch((v) => { v.rules[i].when = { tag: e.target.value }; })}>
                    <option value="">(escolha)</option>
                    {graph.tags.map((t) => <option key={t.tag} value={t.tag}>#{t.tag}</option>)}
                  </select>
                ) : kind === "type" ? (
                  <select value={r.when.type ?? ""} onChange={(e) => patch((v) => { v.rules[i].when = { type: e.target.value }; })}>
                    <option value="">(escolha)</option>
                    {graph.types.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <input value={r.when[kind] ?? ""} type={kind === "minDegree" ? "number" : "text"} onChange={(e) => patch((v) => { v.rules[i].when = { [kind]: kind === "minDegree" ? Number(e.target.value) : e.target.value }; })} />
                )}
                <button type="button" className="nt-btn danger" onClick={() => patch((v) => { v.rules.splice(i, 1); })} aria-label="Remover regra"><Trash2 size={14} /></button>
              </div>
              <div className="gf-rule-set">
                <label>Cor <input type="color" value={r.set.color || "#0c66e4"} onChange={(e) => patch((v) => { v.rules[i].set.color = e.target.value; })} /></label>
                <label>Forma
                  <select value={r.set.shape || ""} onChange={(e) => patch((v) => { if (e.target.value) v.rules[i].set.shape = e.target.value; else delete v.rules[i].set.shape; })}>
                    <option value="">—</option>{SHAPES.map((s) => <option key={s} value={s}>{SHAPE_LABEL[s]}</option>)}
                  </select>
                </label>
                <label>Ícone
                  <select value={r.set.icon || ""} onChange={(e) => patch((v) => { if (e.target.value) v.rules[i].set.icon = e.target.value; else delete v.rules[i].set.icon; })}>
                    <option value="">—</option>{ICONS.map((s) => <option key={s} value={s}>{ICON_LABEL[s]}</option>)}
                  </select>
                </label>
                <label>Borda
                  <select value={r.set.border || ""} onChange={(e) => patch((v) => { if (e.target.value) v.rules[i].set.border = e.target.value; else delete v.rules[i].set.border; })}>
                    <option value="">—</option>{BORDERS.map((s) => <option key={s} value={s}>{BORDER_LABEL[s]}</option>)}
                  </select>
                </label>
                <label>Tamanho
                  <input type="number" min="10" max="120" value={r.set.size ?? ""} onChange={(e) => patch((v) => { if (e.target.value) v.rules[i].set.size = Number(e.target.value); else delete v.rules[i].set.size; })} />
                </label>
              </div>
            </div>
          );
        })}
        <button type="button" className="nt-btn" onClick={() => patch((v) => { v.rules.push({ when: { tag: graph.tags[0]?.tag || "" }, set: { color: "#c9372c", shape: "hexagon" } }); })}><Plus size={14} /> Adicionar regra</button>
      </div>

      <div className="gf-editor-foot">
        <button type="button" className="nt-btn primary" onClick={() => onSave(d)}>Salvar visão</button>
        <button type="button" className="nt-btn" onClick={() => onDuplicate(d)} title="Duplicar"><Copy size={14} /></button>
        <button type="button" className="nt-btn danger" disabled={!canDelete} onClick={() => onDelete(d)} title="Excluir"><Trash2 size={14} /></button>
      </div>
    </aside>
  );
}
