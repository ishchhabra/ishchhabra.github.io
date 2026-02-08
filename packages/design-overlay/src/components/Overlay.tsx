import { useState } from "react";
import { useElementSelection } from "@/hooks/useElementSelection";
import { HoverOutline } from "./HoverOutline";
import { SelectionOutlines } from "./SelectionOutlines";
import { Toolbar } from "./Toolbar";

export interface OverlayProps {
  className?: string | undefined;
  /** API URL for the AI edit chat endpoint. When provided, natural language edits use the AI SDK. */
  apiUrl?: string | undefined;
  /** Ollama model ID (e.g. llama3.2, qwen2.5-coder:7b). Overrides OLLAMA_MODEL env. */
  model?: string | undefined;
  /** Ollama base URL (e.g. http://localhost:11434). Overrides OLLAMA_BASE_URL env. */
  ollamaBaseUrl?: string | undefined;
  /** Callback when user submits an edit request without apiUrl. */
  onEditRequest?: ((message: string) => void) | undefined;
}

export default function Overlay({
  apiUrl = "/api/chat",
  model,
  ollamaBaseUrl,
  onEditRequest,
}: OverlayProps) {
  const [active, setActive] = useState(false);
  const { hoveredElement, selectedElements, clearSelection } = useElementSelection(active);

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
          apiUrl={apiUrl}
          model={model}
          ollamaBaseUrl={ollamaBaseUrl}
          onEditRequest={onEditRequest}
          selectedElements={selectedElements}
        />
      </div>
    </div>
  );
}
