import { MousePointerClick, Trash2 } from "lucide-react";

interface ToolbarProps {
  active: boolean;
  onToggle: () => void;
  selectedCount: number;
  onClear: () => void;
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
        color: active ? "#fff" : "rgba(161,161,170,1)",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget.style.background = "rgba(255,255,255,0.1)");
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget.style.background = "transparent");
      }}
    >
      {children}
    </button>
  );
}

export function Toolbar({ active, onToggle, selectedCount, onClear }: ToolbarProps) {
  return (
    <div
      data-i2-overlay
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 6px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.12)",
        backgroundColor: "rgba(24,24,27,0.96)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      }}
    >
      <IconButton onClick={onToggle} title={active ? "Exit select mode" : "Enter select mode"} active={active}>
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
  );
}
