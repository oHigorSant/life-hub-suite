"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

// Módulos opcionais: NEXT_PUBLIC_LIFEHUB_TRILHAS=0 (no .env.local, antes do build) esconde o app Trilhas.
const TRILHAS_ON = process.env.NEXT_PUBLIC_LIFEHUB_TRILHAS !== "0";

const ALL_AREAS = [
  {
    href: "/",
    label: "Início",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11.5 12 4l8 7.5" />
        <path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9" />
      </svg>
    ),
  },
  {
    href: "/tarefas",
    label: "Tarefas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="4.5" width="6" height="15" rx="1.5" />
        <rect x="14.5" y="4.5" width="6" height="9" rx="1.5" />
        <path d="M17 8.5h0" />
      </svg>
    ),
  },
  {
    href: "/financas",
    label: "Finanças",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 14.5h4" />
      </svg>
    ),
  },
  {
    href: "/estudos",
    label: "Estudos",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" />
        <path d="M22 10v6" />
        <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
      </svg>
    ),
  },
  {
    href: "/ingles",
    label: "Inglês",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h9M8.5 4v2M5.5 6c.6 3 2.7 5.2 5.5 6.5M11.5 6c-.6 3-2.7 5.2-5.5 6.5" />
        <path d="m13 20 3.5-9 3.5 9M14.2 17h4.6" />
      </svg>
    ),
  },
  {
    href: "/trilhas",
    label: "Trilhas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z" />
      </svg>
    ),
  },
  {
    href: "/biblia",
    label: "Bíblia",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 6.5C10.3 5.2 8 4.6 4.5 4.6v13.9c3.5 0 5.8.6 7.5 1.9 1.7-1.3 4-1.9 7.5-1.9V4.6C16 4.6 13.7 5.2 12 6.5Z" />
        <path d="M12 6.5v13.9" />
      </svg>
    ),
  },
  {
    href: "/notas",
    label: "Notas",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v17H5.5A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M8 7.5h7M8 11.5h7" />
      </svg>
    ),
  },
  {
    href: "/quadros",
    label: "Quadros",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    ),
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
        <path d="M12 13.5v2.5l1.8 1" />
      </svg>
    ),
  },
  {
    href: "/motores",
    label: "Motores",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="6" width="12" height="12" rx="2" />
        <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
        <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
      </svg>
    ),
  },
];

const AREAS = ALL_AREAS.filter((a) => TRILHAS_ON || a.href !== "/trilhas");

/**
 * Navegação persistente entre áreas do Life Hub. Substitui o antigo
 * ModuleNav (pill flutuante com position:fixed que sobrepunha conteúdo das
 * páginas) — agora ocupa espaço real no layout, não flutua por cima de
 * nada. No celular vira uma barra fina no topo com um menu que abre um
 * painel com as áreas, pra não competir com a aba Quadro/Chat de cada área
 * (essa continua fixa embaixo, própria de cada módulo).
 */
const LAST_KEY = "lh-last-pages";
const COLLAPSE_KEY = "lh-sidebar-collapsed";

function areaOf(pathname) {
  const hit = AREAS.filter((a) => a.href !== "/").find((a) => pathname === a.href || pathname.startsWith(a.href + "/"));
  return hit ? hit.href : null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [last, setLast] = useState({});

  const isActive = (href) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/"));

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      setLast(JSON.parse(localStorage.getItem(LAST_KEY) || "{}"));
    } catch {}
  }, []);

  // Lembra a última página de cada área: ao voltar para "Estudos" você cai onde estava (não na raiz).
  useEffect(() => {
    const area = areaOf(pathname);
    if (!area) return;
    const here = `${pathname}${search ? `?${search}` : ""}`;
    setLast((cur) => {
      if (cur[area] === here) return cur;
      const next = { ...cur, [area]: here };
      try { localStorage.setItem(LAST_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [pathname, search]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch {}
      return !v;
    });
  }

  // Dentro da área, clicar nela volta ao começo dela; vindo de fora, volta à última página visitada.
  const hrefFor = (area) => (isActive(area.href) ? area.href : last[area.href] || area.href);

  return (
    <>
      <nav className={`sidebar${collapsed ? " collapsed" : ""}`}>
        <div className="sidebar-mark">LH</div>
        {AREAS.map((area) => (
          <Link
            key={area.href}
            href={hrefFor(area)}
            title={area.label}
            className={`sidebar-item${isActive(area.href) ? " active" : ""}`}
          >
            <span className="sidebar-icon">{area.icon}</span>
            <span className="sidebar-label">{area.label}</span>
          </Link>
        ))}
        <button type="button" className="sidebar-collapse" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir a barra" : "Recolher a barra"} title={collapsed ? "Expandir a barra" : "Recolher a barra"}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? "rotate(180deg)" : "none" }}>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </nav>

      <div className="mobile-topbar">
        <button
          type="button"
          className="mobile-topbar-menu"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu de áreas"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="mobile-topbar-title">
          {AREAS.find((a) => isActive(a.href))?.label ?? "Life Hub"}
        </span>
      </div>

      {mobileOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-head">
              <span>Áreas</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            {AREAS.map((area) => (
              <Link
                key={area.href}
                href={hrefFor(area)}
                className={`mobile-drawer-item${isActive(area.href) ? " active" : ""}`}
                onClick={() => setMobileOpen(false)}
              >
                <span className="sidebar-icon">{area.icon}</span>
                {area.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}