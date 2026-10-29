import { Suspense } from "react";
import { Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import LiveBridge from "@/components/agent/LiveBridge.jsx";
import AgentFab from "@/components/agent/AgentFab.jsx";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Life Hub",
  description: "Central pessoal de tarefas, finanças e rotinas",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>
        <div className="shell-root">
          <Suspense fallback={<nav className="sidebar" />}>
            <Sidebar />
          </Suspense>
          <div className="shell-content">{children}</div>
        </div>
        <LiveBridge />
        <AgentFab />
      </body>
    </html>
  );
}
