import { useState } from "react";
import { useElementSelection } from "@/hooks/useElementSelection";
import { HoverOutline } from "./HoverOutline";
import { SelectionOutlines } from "./SelectionOutlines";
import { Toolbar } from "./Toolbar";

export interface OverlayProps {
  className?: string;
}

export default function Overlay({}: OverlayProps) {
  const [active, setActive] = useState(false);
  const { hoveredElement, selectedElements, clearSelection } =
    useElementSelection(active);

  return (
    <div data-i2-overlay className="fixed inset-0 z-[9999] pointer-events-none">
      {active && <HoverOutline element={hoveredElement} />}
      <SelectionOutlines elements={selectedElements} />
      <div
        data-i2-overlay
        className="pointer-events-auto fixed bottom-6 left-1/2 z-[10001] -translate-x-1/2"
      >
        <Toolbar
          active={active}
          onToggle={() => setActive((a) => !a)}
          selectedCount={selectedElements.length}
          onClear={clearSelection}
        />
      </div>
    </div>
  );
}
