import { MousePointerClick, Settings2, Trash2 } from "lucide-react";
import { AIEditPrompt } from "./AIEditPrompt";
import type { LocalAIConfig } from "./SettingsModal";

export interface ToolbarProps {
  active: boolean;
  onToggle: () => void;
  selectedCount: number;
  onClear: () => void;
  config: LocalAIConfig;
  onOpenSettings: () => void;
  /** Callback when user submits an edit request without local SDK. */
  onEditRequest?: ((message: string) => void) | undefined;
  /** Currently selected DOM elements (needed by the AI edit prompt). */
  selectedElements?: Element[] | undefined;
}

function IconButton({
  onClick,
  title,
  active,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        transition: "background 150ms",
        background: active ? "rgb(5,150,105)" : "transparent",
        color: active ? "#fff" : "var(--overlay-bar-muted)",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--accent)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

export function Toolbar({
  active,
  onToggle,
  selectedCount,
  onClear,
  config,
  onOpenSettings,
  onEditRequest,
  selectedElements,
}: ToolbarProps) {
  return (
    <div
      data-i2-overlay
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 6px",
        borderRadius: 10,
        border: "1px solid var(--overlay-bar-border)",
        backgroundColor: "var(--overlay-bar-bg)",
        backdropFilter: "blur(12px)",
        boxShadow: "var(--overlay-bar-shadow)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <IconButton
          onClick={onToggle}
          title={active ? "Exit select mode" : "Enter select mode"}
          active={active}
        >
          <MousePointerClick size={16} />
        </IconButton>

        {selectedCount > 0 && (
          <>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: 9999,
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "system-ui, sans-serif",
                background: "rgba(5,150,105,0.15)",
                color: "rgb(52,211,153)",
                lineHeight: "18px",
              }}
            >
              {selectedCount}
            </span>
            <IconButton onClick={onClear} title="Clear selection">
              <Trash2 size={14} />
            </IconButton>
          </>
        )}
      </div>

      {active && (
        <>
          <span
            style={{
              width: 1,
              height: 20,
              background: "var(--overlay-bar-divider)",
              borderRadius: 1,
            }}
          />
          <AIEditPrompt
            config={config}
            onEditRequest={onEditRequest}
            selectedElements={selectedElements ?? []}
            placeholder="Ask for edits..."
          />
          <span
            style={{
              width: 1,
              height: 20,
              background: "var(--overlay-bar-divider)",
              borderRadius: 1,
            }}
          />
          <IconButton onClick={onOpenSettings} title="Local Settings">
            <Settings2 size={16} />
          </IconButton>
        </>
      )}
    </div>
  );
}
