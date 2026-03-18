import { Link, useLocation } from "@tanstack/react-router";
import { useTheme } from "../lib/theme";

function NavLinkContent({ to, label, exact }: { to: string; label: string; exact: boolean }) {
  const location = useLocation();
  const isHash = to.startsWith("/#");
  const targetHash = to.slice(1);

  const activeClass = "text-zinc-900 dark:text-white";
  const inactiveClass = "text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white";

  if (isHash) {
    const isActive = location.pathname === "/" && location.hash === targetHash;
    return (
      <Link
        to="/"
        hash={targetHash.replace("#", "")}
        className={isActive ? activeClass : inactiveClass}
      >
        {label}
      </Link>
    );
  }

  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <Link to={to} className={isActive ? activeClass : inactiveClass}>
      {label}
    </Link>
  );
}

export function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header
      className="relative border-b border-zinc-200 dark:border-white/5"
      style={{ viewTransitionName: "header" }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ish
        </Link>
        <nav className="flex items-center gap-6 text-[13px]">
          <NavLinkContent to="/" label="Home" exact />
          <NavLinkContent to="/lab" label="Lab" exact={false} />
          <NavLinkContent to="/writing" label="Writing" exact={false} />
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-white"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </nav>
      </div>
    </header>
  );
}
