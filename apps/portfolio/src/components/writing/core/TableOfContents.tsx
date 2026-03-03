import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

interface TocItem {
  id: string;
  label: string;
  indent?: boolean;
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    function onScroll() {
      const cutoff = window.innerHeight * 0.2;
      let current = "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= cutoff) {
          current = item.id;
        }
      }
      setActiveId(current);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [items]);

  return (
    <nav className="hidden xl:block">
      <div className="sticky top-24">
        <span className="mb-3 block text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
          On this page
        </span>
        <ul className="space-y-1.5 border-l border-zinc-200 dark:border-white/5">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <Link
                  to="."
                  hash={item.id}
                  className={`block border-l-2 py-1 text-[12px] leading-snug transition-colors ${
                    item.indent ? "pl-6" : "pl-4"
                  } ${
                    isActive
                      ? "border-blue-500 text-zinc-800 dark:text-zinc-200"
                      : "border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-400"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
