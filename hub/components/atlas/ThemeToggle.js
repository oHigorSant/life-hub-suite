"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const KEY = "atlas-theme";
const apply = (v) => document.querySelector(".atlas-root")?.setAttribute("data-theme", v);

/** Alterna entre o modo claro (padrão) e o escuro do Atlas; a escolha fica neste navegador. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState("light");
  useEffect(() => {
    let v = "light";
    try { if (localStorage.getItem(KEY) === "dark") v = "dark"; } catch { /* sem storage */ }
    setTheme(v);
    apply(v);
  }, []);
  function toggle() {
    const v = theme === "light" ? "dark" : "light";
    setTheme(v);
    apply(v);
    try { localStorage.setItem(KEY, v); } catch { /* sem storage */ }
  }
  return (
    <button type="button" className="btn ghost sm" onClick={toggle} aria-label={theme === "light" ? "Usar modo escuro" : "Usar modo claro"} title={theme === "light" ? "Modo escuro" : "Modo claro"}>
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}