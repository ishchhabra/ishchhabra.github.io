import { useEffect, useState } from "react";

interface TocItem {
  id: string;
  label: string;
  indent?: boolean;
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const item of items) {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="hidden xl:block">
      <div className="sticky top-24">
        <span className="mb-3 block text-[10px] font-semibold tracking-widest text-zinc-600 uppercase">
          On this page
        </span>
        <ul className="space-y-1.5 border-l border-white/5">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className={`block border-l-2 py-1 text-[12px] leading-snug transition-colors ${
                    item.indent ? "pl-6" : "pl-4"
                  } ${
                    isActive
                      ? "border-blue-500 text-zinc-200"
                      : "border-transparent text-zinc-600 hover:text-zinc-400"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
