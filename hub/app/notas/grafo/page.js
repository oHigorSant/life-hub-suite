import { Suspense } from "react";
import GraphClient from "@/components/notas/GraphClient.jsx";

export default function Page() {
  return (
    <Suspense fallback={<p className="nt-empty" style={{ padding: 24 }}>Carregando grafo…</p>}>
      <GraphClient />
    </Suspense>
  );
}
