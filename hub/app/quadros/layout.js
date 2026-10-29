import "./quadros.css";

export const metadata = {
  title: "Quadros — Life Hub",
  description: "Quadros do Excalidraw salvos automaticamente.",
};

export default function QuadrosLayout({ children }) {
  return <div className="qd-shell">{children}</div>;
}
