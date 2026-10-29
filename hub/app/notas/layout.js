import "./notas.css";

export const metadata = {
  title: "Notas — Life Hub",
  description: "Notas em markdown com grafo, áreas em hierarquia e visões salvas.",
};

export default function NotasLayout({ children }) {
  return <div className="nt-shell">{children}</div>;
}
