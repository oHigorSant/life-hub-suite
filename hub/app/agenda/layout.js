import "./agenda.css";

export const metadata = {
  title: "Agenda — Life Hub",
  description: "Calendário, rotina e ferramentas de tempo (pomodoro, timer, cronômetro, relógio).",
};

export default function AgendaLayout({ children }) {
  return <div className="ag-shell">{children}</div>;
}
