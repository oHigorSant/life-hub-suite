"use client";

import { useEffect, useState } from "react";
import "./trilhas.css";

// Trilhas (app de aprendizado, porta 4300) embutido via proxy do próprio Hub em /trilhas-app.
// O login do Hub protege o proxy; o hash (#/t/sql/licao) leva direto para uma lição.
export default function TrilhasPage() {
  const [src, setSrc] = useState(null);
  useEffect(() => { setSrc(`/trilhas-app/?embed=1${window.location.hash || ""}`); }, []);
  return (
    <div className="trilhas-frame">
      {src && <iframe src={src} title="Trilhas" allow="clipboard-write" />}
    </div>
  );
}