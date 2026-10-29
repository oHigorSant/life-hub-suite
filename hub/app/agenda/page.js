import { Suspense } from "react";
import AgendaClient from "@/components/agenda/AgendaClient.jsx";

export default function Page() {
  return (
    <Suspense fallback={<p style={{ padding: 24, color: "var(--text-muted)" }}>Carregando agenda…</p>}>
      <AgendaClient />
    </Suspense>
  );
}
