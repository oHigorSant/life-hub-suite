import "./atlas.css";

export const metadata = {
  title: "Estudos — Life Hub",
  description: "Árvore de habilidades personalizada, do iniciante ao ápice.",
};

export default function EstudosLayout({ children }) {
  return (
    <>
      <div className="atlas-root" data-theme="light">{children}</div>
      <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("atlas-theme")==="dark")document.querySelector(".atlas-root").setAttribute("data-theme","dark")}catch(e){}` }} />
    </>
  );
}
