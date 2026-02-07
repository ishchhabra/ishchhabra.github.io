import { Link, NavLink, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div className="relative min-h-svh bg-zinc-950">
      {/* Background gradient */}
      <div
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59, 130, 246, 0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(139, 92, 246, 0.06), transparent)",
        }}
      />

      <header className="relative border-b border-white/5">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link
            to="/"
            className="text-xl font-semibold tracking-tight text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            i2 labs
          </Link>
          <nav className="flex gap-8 text-sm">
            <NavLink
              to="/projects/sandbox"
              className={({ isActive }) =>
                isActive
                  ? "text-white"
                  : "text-zinc-400 transition-colors hover:text-white"
              }
            >
              Sandbox
            </NavLink>
            <NavLink
              to="/projects/design-overlay"
              className={({ isActive }) =>
                isActive
                  ? "text-white"
                  : "text-zinc-400 transition-colors hover:text-white"
              }
            >
              Design Overlay
            </NavLink>
          </nav>
        </div>
      </header>

      <Outlet />
    </div>
  );
}
