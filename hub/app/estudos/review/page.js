"use client";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/atlas/ui.js";
import Flash from "@/components/atlas/Flash.js";

export default function Review() {
  const [q, setQ] = useState(null);
  useEffect(() => {
    const s = new URLSearchParams(location.search).get("subject");
    setQ(s ? `?subject=${s}` : "");
  }, []);
  return (
    <div className="shell">
      <Topbar crumbs={[{ label: "Revisão espaçada" }]} />
      <main className="page" style={{ maxWidth: 680 }}>
        <h1 style={{ marginBottom: 6 }}>Revisão</h1>
        <p className="muted" style={{ marginTop: 0, marginBottom: 22 }}>Recupere cada cartão de memória antes de virar. Seja honesto: é a honestidade que agenda a próxima revisão.</p>
        {q !== null && <Flash query={q} />}
      </main>
    </div>
  );
}
