import { useElementSelection } from "@/hooks/useElementSelection";
import { useState } from "react";
import { HoverOutline } from "./HoverOutline";
import { SelectionOutlines } from "./SelectionOutlines";
import { SettingsModal, type LocalAIConfig } from "./SettingsModal";
import { Toolbar } from "./Toolbar";

export interface OverlayProps {
  className?: string | undefined;
  /** Callback when user submits an edit request without local SDK processing. */
  onEditRequest?: ((message: string) => void) | undefined;
}

export default function Overlay({ onEditRequest }: OverlayProps) {
  const [active, setActive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<LocalAIConfig>(() => {
    try {
      const stored = localStorage.getItem("ish_design_overlay_config");
      if (stored) return JSON.parse(stored) as LocalAIConfig;
    } catch {
      // ignore
    }
    return { baseUrl: "http://localhost:11434", model: "llama3.2" };
  });

  const { hoveredElement, selectedElements, clearSelection } = useElementSelection(
    active && !settingsOpen,
  );

  const handleConfigChange = (newConfig: LocalAIConfig) => {
    setConfig(newConfig);
    try {
      localStorage.setItem("ish_design_overlay_config", JSON.stringify(newConfig));
    } catch {
      // ignore
    }
  };

  return (
    <div data-i2-overlay className="fixed inset-0 z-[9999] pointer-events-none">
      {active && <HoverOutline element={hoveredElement} />}
      <SelectionOutlines elements={selectedElements} />

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        config={config}
        onConfigChange={handleConfigChange}
      />

      <div
        data-i2-overlay
        className="pointer-events-auto fixed bottom-6 left-1/2 z-[10001] -translate-x-1/2"
      >
        <Toolbar
          active={active}
          onToggle={() => setActive((a) => !a)}
          selectedCount={selectedElements.length}
          onClear={clearSelection}
          config={config}
          onOpenSettings={() => setSettingsOpen(true)}
          onEditRequest={onEditRequest}
          selectedElements={selectedElements}
        />
      </div>
    </div>
  );
}
