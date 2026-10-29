"use client";

import { resolveBrand, categoryColor, BRAND_ICON_PATHS } from "@/lib/financeBrand";
import CategoryIcon, { hasCategoryIcon } from "@/components/CategoryIcon";

/** Iniciais pro avatar circular (Cartão Nubank -> NU). */
function initials(name) {
  const words = String(name || "?").replace(/^cart[ãa]o\s+/i, "").trim().split(/\s+/);
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Avatar circular: logo da marca quando reconhecida (Nubank, PicPay, Google, Claude, Caixa, C6...), senão o ícone da
 * categoria ou iniciais sobre a cor da categoria.
 */
export default function BrandAvatar({ name, fallbackName, fallbackColor, size = "md", dot = false }) {
  const brand = resolveBrand(name);
  const catName = fallbackName ?? name;
  const sizeClass = size === "sm" ? " sm" : "";
  let avatar;
  if (brand?.paths) {
    avatar = (
      <span className={`fin-avatar${sizeClass} light`} style={{ background: brand.bg }}>
        <svg viewBox={brand.viewBox} className="fin-avatar-icon" aria-hidden="true">
          <g transform={brand.transform}>{brand.paths.map((p, i) => <path key={i} d={p.d} fill={p.fill} />)}</g>
        </svg>
      </span>
    );
  } else if (brand?.strokePaths) {
    avatar = (
      <span className={`fin-avatar${sizeClass}`} style={{ background: brand.bg }}>
        <svg viewBox={brand.viewBox} className="fin-avatar-icon" aria-hidden="true">
          {brand.strokePaths.map((d, i) => <path key={i} d={d} fill="none" stroke="#fff" strokeWidth={brand.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />)}
          {(brand.circles ?? []).map((c, i) => <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke="#fff" strokeWidth={brand.strokeWidth} />)}
        </svg>
      </span>
    );
  } else {
    const bg = brand?.bg || fallbackColor || categoryColor(catName);
    avatar = (
      <span className={`fin-avatar${sizeClass}`} style={{ background: bg }}>
        {brand?.icon ? (
          <svg viewBox="0 0 24 24" className="fin-avatar-icon" aria-hidden="true"><path d={BRAND_ICON_PATHS[brand.icon]} fill="#fff" fillRule="evenodd" /></svg>
        ) : hasCategoryIcon(catName) ? (
          <CategoryIcon name={catName} className="fin-avatar-icon" />
        ) : (
          initials(name)
        )}
      </span>
    );
  }
  if (!dot) return avatar;
  return <span className="fin-avatar-wrap">{avatar}<span className="fin-avatar-dot" aria-hidden="true" /></span>;
}
