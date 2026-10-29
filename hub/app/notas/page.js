import { Suspense } from "react";
import NotesClient from "@/components/notas/NotesClient.jsx";

export default function Page() {
  return (
    <Suspense fallback={<p className="nt-empty" style={{ padding: 24 }}>Carregando notas…</p>}>
      <NotesClient />
    </Suspense>
  );
}
