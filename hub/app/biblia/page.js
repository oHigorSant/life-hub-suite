import { Suspense } from "react";
import BibliaClient from "@/components/biblia/BibliaClient.jsx";
import "./biblia.css";

export const metadata = { title: "Bíblia · Life Hub" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BibliaClient />
    </Suspense>
  );
}
