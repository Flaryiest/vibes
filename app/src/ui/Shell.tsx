import { NavLink, Outlet } from "react-router";
import { useEngine, type EngineStatus } from "./engine";

const STATUS_TEXT: Record<EngineStatus, string> = {
  idle: "",
  starting: "Starting",
  running: "Listening",
  error: "Microphone off",
};

const linkClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? "font-medium text-chalk" : "text-mist transition-colors hover:text-chalk";

/** The frame around every screen: navigation on the left, microphone status on the right. */
export function Shell() {
  const { status } = useEngine();
  return (
    <div className="mx-auto min-h-screen max-w-4xl px-6 pb-24 pt-8 sm:px-10">
      <header className="flex items-baseline justify-between text-sm">
        <nav aria-label="Main" className="flex gap-7">
          <NavLink to="/" end className={linkClass}>
            Today
          </NavLink>
          <NavLink to="/practice" className={linkClass}>
            Practice
          </NavLink>
          <NavLink to="/range" className={linkClass}>
            Range
          </NavLink>
          <NavLink to="/lab" className={linkClass}>
            Audio lab
          </NavLink>
        </nav>
        <span data-testid="engine-status" data-state={status} className="text-mist">
          {STATUS_TEXT[status]}
        </span>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
