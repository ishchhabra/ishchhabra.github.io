import type { PendingRequest, PermissionDecision } from "./types";

export interface PermissionPromptProps {
  /** The pending capability request to display. */
  request: PendingRequest;
}

const CAPABILITY_META: Record<
  string,
  { label: string; color: string; bgColor: string; icon: string }
> = {
  fetch: {
    label: "Network Request",
    color: "#3b82f6",
    bgColor: "rgba(59,130,246,0.12)",
    icon: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z",
  },
  storage: {
    label: "Storage Access",
    color: "#a855f7",
    bgColor: "rgba(168,85,247,0.12)",
    icon: "M4 6h18V4H2v13H0v3h14v-3H4V6zm20 2h-8v12h8V8zm-2 9h-4v-7h4v7z",
  },
  clipboard: {
    label: "Clipboard Access",
    color: "#f59e0b",
    bgColor: "rgba(245,158,11,0.12)",
    icon: "M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z",
  },
  cookie: {
    label: "Cookie Access",
    color: "#10b981",
    bgColor: "rgba(16,185,129,0.12)",
    icon: "M4 6h18V4H2v13H0v3h14v-3H4V6zm20 2h-8v12h8V8zm-2 9h-4v-7h4v7z",
  },
};

function decide(request: PendingRequest, decision: PermissionDecision) {
  request.resolve(decision);
}

/**
 * Permission prompt — overlays when the sandbox requests a capability.
 * Inspired by Claude Code / terminal permission UIs.
 */
export function PermissionPrompt({ request }: PermissionPromptProps) {
  const meta = CAPABILITY_META[request.capability] ?? CAPABILITY_META["fetch"]!;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        animation: "sandboxFadeIn 0.15s ease-out",
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes sandboxFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes sandboxSlideUp {
              from { opacity: 0; transform: translateY(8px) scale(0.98); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .sandbox-prompt-btn {
              transition: all 0.12s ease;
            }
            .sandbox-prompt-btn:hover {
              filter: brightness(1.15);
              transform: translateY(-1px);
            }
            .sandbox-prompt-btn:active {
              transform: translateY(0);
              filter: brightness(0.95);
            }
          `,
        }}
      />

      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#111113",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow:
            "0 0 0 1px rgba(0,0,0,0.3), 0 24px 48px -12px rgba(0,0,0,0.6), 0 0 80px -20px rgba(0,0,0,0.4)",
          animation: "sandboxSlideUp 0.2s ease-out",
        }}
      >
        {/* Colored top accent */}
        <div
          style={{
            height: 3,
            background: `linear-gradient(to right, ${meta.color}, ${meta.color}88)`,
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: "18px 22px 14px",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: meta.bgColor,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={meta.color}>
              <path d={meta.icon} />
            </svg>
          </div>
          <div>
            <div
              style={{
                color: "#fafafa",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {meta.label}
            </div>
            <div style={{ color: "#71717a", fontSize: 12, marginTop: 1 }}>
              Sandbox is requesting permission
            </div>
          </div>
        </div>

        {/* Request details */}
        <div style={{ padding: "0 22px 18px" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "12px 16px",
              fontFamily: "'JetBrains Mono', ui-monospace, 'SF Mono', 'Cascadia Mono', monospace",
              fontSize: 13,
              color: "#e4e4e7",
              wordBreak: "break-all",
              lineHeight: 1.5,
              letterSpacing: "-0.01em",
            }}
          >
            {request.summary}
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.05)",
            margin: "0 22px",
          }}
        />

        {/* Actions */}
        <div
          style={{
            padding: "16px 22px 18px",
            display: "flex",
            gap: 8,
          }}
        >
          {/* Allow group */}
          <div style={{ flex: 1, display: "flex", gap: 6 }}>
            <button
              type="button"
              className="sandbox-prompt-btn"
              onClick={() => decide(request, "allow-once")}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 8,
                border: `1px solid ${meta.color}33`,
                background: `${meta.color}15`,
                color: meta.color,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Allow once
            </button>
            <button
              type="button"
              className="sandbox-prompt-btn"
              onClick={() => decide(request, "allow-always")}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 8,
                border: "none",
                background: meta.color,
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Always
            </button>
          </div>

          {/* Deny group */}
          <div style={{ flex: 1, display: "flex", gap: 6 }}>
            <button
              type="button"
              className="sandbox-prompt-btn"
              onClick={() => decide(request, "deny-once")}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                color: "#a1a1aa",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Deny once
            </button>
            <button
              type="button"
              className="sandbox-prompt-btn"
              onClick={() => decide(request, "deny-always")}
              style={{
                flex: 1,
                padding: "9px 0",
                borderRadius: 8,
                border: "1px solid rgba(239,68,68,0.15)",
                background: "rgba(239,68,68,0.08)",
                color: "#ef4444",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                letterSpacing: "0.01em",
              }}
            >
              Always
            </button>
          </div>
        </div>

        {/* Hint */}
        <div
          style={{
            padding: "0 22px 14px",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: 11, color: "#52525b", letterSpacing: "0.02em" }}>
            This decision applies to this sandbox session only
          </span>
        </div>
      </div>
    </div>
  );
}
