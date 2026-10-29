import { Suspense } from "react";
import LazerClient from "@/components/lazer/LazerClient.jsx";
import "./lazer.css";

export const metadata = { title: "Lazer — Life Hub" };

export default function Page() {
  return (
    <Suspense fallback={<p style={{ padding: 24, color: "var(--text-muted)" }}>Carregando…</p>}>
      <LazerClient />
    </Suspense>
  );
}
