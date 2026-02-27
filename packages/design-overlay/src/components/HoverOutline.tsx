import { useEffect, useState } from "react";

interface HoverOutlineProps {
  element: Element | null;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function getLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls =
    el.className && typeof el.className === "string"
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  return `${tag}${id}${cls}`;
}

export function HoverOutline({ element }: HoverOutlineProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!element) return;

    const update = () => {
      setRect(getRect(element));
      setLabel(getLabel(element));
    };
    const onScroll = () => requestAnimationFrame(update);
    requestAnimationFrame(update);
    window.addEventListener("scroll", onScroll, { capture: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [element]);

  const displayRect = element ? rect : null;
  const displayLabel = element ? label : "";
  if (!displayRect) return null;

  return (
    <div data-i2-overlay className="pointer-events-none fixed inset-0 z-[9998]">
      <div
        style={{
          position: "absolute",
          left: displayRect.left,
          top: displayRect.top,
          width: displayRect.width,
          height: displayRect.height,
          border: "1.5px solid rgba(99,102,241,0.7)",
          background: "rgba(99,102,241,0.06)",
          borderRadius: 2,
          transition: "all 60ms ease-out",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: displayRect.left,
          top: Math.max(0, displayRect.top - 20),
          fontSize: 10,
          fontFamily: "ui-monospace, monospace",
          fontWeight: 500,
          lineHeight: "16px",
          padding: "1px 5px",
          borderRadius: 3,
          background: "rgba(99,102,241,0.9)",
          color: "#fff",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {displayLabel}
      </div>
    </div>
  );
}
