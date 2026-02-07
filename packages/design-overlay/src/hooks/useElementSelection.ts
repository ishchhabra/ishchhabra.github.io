import { useCallback, useEffect, useRef, useState } from "react";

const IGNORED_TAGS = new Set([
  "HTML",
  "BODY",
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "IFRAME",
  "HEAD",
  "META",
  "LINK",
  "BR",
]);

/**
 * Walk up from the deepest element to find the most meaningful one.
 * Skips purely structural wrappers that only have one child element.
 */
function resolveTarget(raw: Element): Element | null {
  let el: Element | null = raw;

  // Skip overlay elements
  while (el && el.closest("[data-i2-overlay]")) {
    el = el.parentElement;
  }
  if (!el || IGNORED_TAGS.has(el.tagName)) return null;

  return el;
}

export interface ElementSelectionResult {
  /** The element currently hovered (null when not hovering anything meaningful). */
  hoveredElement: Element | null;
  /** The set of selected elements. */
  selectedElements: Element[];
  /** Clear all selected elements. */
  clearSelection: () => void;
}

export function useElementSelection(active: boolean): ElementSelectionResult {
  const [hoveredElement, setHoveredElement] = useState<Element | null>(null);
  const [selectedElements, setSelectedElements] = useState<Element[]>([]);
  const activeRef = useRef(active);
  activeRef.current = active;

  // --- hover tracking via native events (works through the capture layer) ---
  const isOverlayEvent = (e: Event): boolean => {
    const target = e.target as Element | null;
    return !!target?.closest?.("[data-i2-overlay]");
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!activeRef.current || isOverlayEvent(e)) {
      setHoveredElement(null);
      return;
    }
    // elementsFromPoint gives us the deepest element first
    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const target = stack.find((el) => resolveTarget(el) === el && !IGNORED_TAGS.has(el.tagName));
    const resolved = target ? resolveTarget(target) : null;
    setHoveredElement(resolved);
  }, []);

  const onClick = useCallback((e: MouseEvent) => {
    if (!activeRef.current || isOverlayEvent(e)) return;
    e.preventDefault();
    e.stopPropagation();

    const stack = document.elementsFromPoint(e.clientX, e.clientY);
    const target = stack.find((el) => resolveTarget(el) === el && !IGNORED_TAGS.has(el.tagName));
    const resolved = target ? resolveTarget(target) : null;
    if (!resolved) return;

    setSelectedElements((prev) => {
      const already = prev.includes(resolved);
      if (e.shiftKey) {
        // Shift+click: toggle element in selection
        return already ? prev.filter((el) => el !== resolved) : [...prev, resolved];
      }
      // Normal click: single-select (or deselect if clicking same element)
      return already && prev.length === 1 ? [] : [resolved];
    });
  }, []);

  useEffect(() => {
    if (!active) {
      setHoveredElement(null);
      setSelectedElements([]);
      document.body.style.userSelect = "";
      return;
    }

    // Disable browser text selection (e.g. Shift+click extending selection)
    document.body.style.userSelect = "none";

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);

    return () => {
      document.body.style.userSelect = "";
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [active, onPointerMove, onClick]);

  const clearSelection = useCallback(() => {
    setSelectedElements([]);
  }, []);

  return { hoveredElement, selectedElements, clearSelection };
}
