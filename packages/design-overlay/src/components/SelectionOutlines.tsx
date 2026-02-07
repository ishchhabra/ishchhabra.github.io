import { useEffect, useState } from "react";

interface SelectionOutlinesProps {
  elements: Element[];
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function SelectionOutlines({ elements }: SelectionOutlinesProps) {
  const [rects, setRects] = useState<Rect[]>([]);

  useEffect(() => {
    if (elements.length === 0) {
      setRects([]);
      return;
    }

    const update = () => {
      setRects(
        elements.map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, width: r.width, height: r.height };
        })
      );
    };

    update();

    const observer = new ResizeObserver(update);
    const onScroll = () => requestAnimationFrame(update);

    elements.forEach((el) => observer.observe(el));
    window.addEventListener("scroll", onScroll, { capture: true });
    window.addEventListener("resize", update);

    return () => {
      elements.forEach((el) => observer.unobserve(el));
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [elements]);

  if (rects.length === 0) return null;

  return (
    <div data-i2-overlay className="pointer-events-none fixed inset-0 z-[9998]">
      {rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            border: "2px solid rgb(5,150,105)",
            background: "rgba(5,150,105,0.06)",
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}
