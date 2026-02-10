import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";

const labItems = [
  { to: "/lab/sandbox" as const, label: "React Sandbox" },
  { to: "/lab/design-overlay" as const, label: "Design Overlay" },
];

function NavLinkContent({ to, label, exact }: { to: string; label: string; exact: boolean }) {
  const location = useLocation();
  const isHash = to.startsWith("/#");
  const targetHash = to.slice(1);

  const activeClass = "text-white";
  const inactiveClass = "text-zinc-500 transition-colors hover:text-white";

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

function LabDropdown() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const isLabActive =
    (location.pathname === "/" && location.hash === "#lab") || location.pathname.startsWith("/lab");

  const activeClass = "text-white";
  const inactiveClass = "text-zinc-500 transition-colors hover:text-white";

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        to="/"
        hash="lab"
        className={`inline-flex items-center gap-1 ${isLabActive ? activeClass : inactiveClass}`}
      >
        Lab
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Link>
      {open && (
        <div
          className="absolute left-0 top-full z-50 -mt-px min-w-[180px] rounded-lg border border-white/10 bg-zinc-900/95 py-2 shadow-xl backdrop-blur-sm"
          role="menu"
        >
          {labItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              className={`block px-4 py-2 text-[13px] transition-colors hover:bg-white/5 hover:text-white ${
                location.pathname === item.to ? "text-white" : "text-zinc-400"
              }`}
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function Header() {
  return (
    <header className="relative border-b border-white/5" style={{ viewTransitionName: "header" }}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link
          to="/"
          className="text-[15px] font-semibold tracking-tight text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          ish
        </Link>
        <nav className="flex items-center gap-6 text-[13px]">
          <NavLinkContent to="/" label="Home" exact />
          <LabDropdown />
          <NavLinkContent to="/writing" label="Writing" exact={false} />
        </nav>
      </div>
    </header>
  );
}
