import MonacoEditor from "@monaco-editor/react";
import type * as monacoNs from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  useCurrentFrame,
} from "remotion";

// ── File contents ────────────────────────────────────────────────────

const APP_TSX = `import { useState } from "react";
import { Button } from "@packages/ui";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="app">
      <h1>My App</h1>
      <Button variant="primary" onClick={() => setCount((c) => c + 1)}>
        Clicked {count} times
      </Button>
    </div>
  );
}
`;

const BUTTON_DTS = `import { type ReactNode } from "react";

interface ButtonProps {
    children: ReactNode;
    variant?: "primary" | "secondary";
    onClick?: () => void;
}

export declare const Button: React.FC<ButtonProps>;
`;

const BUTTON_TSX = `import { type ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  onClick,
}) => {
  return (
    <button className={styles[variant]} onClick={onClick}>
      {children}
    </button>
  );
};
`;

// ── VS Code exact colors ─────────────────────────────────────────────

const VS = {
  bg: "#1e1e1e",
  activityBarBg: "#333333",
  tabActiveBg: "#1e1e1e",
  tabInactiveBg: "#2d2d2d",
  tabBorder: "#252526",
  statusBarBg: "#007acc",
  statusBarText: "#ffffff",
  titleBarBg: "#3c3c3c",
  breadcrumbText: "#cccccc",
  lineNumber: "#858585",
};

// ── CSS class for Cmd+hover link effect ──────────────────────────────
const CMD_HOVER_CSS = `
.cmd-hover-link {
  color: #4fc1ff !important;
  text-decoration: underline !important;
  text-decoration-color: #4fc1ff !important;
  cursor: pointer !important;
}
`;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ── Shared CmdClick scene ────────────────────────────────────────────

type Variant = "before" | "after";

/**
 * Timeline for each video (150 frames = 5s at 30fps):
 *   0-30:  idle
 *  30-60:  mouse moves to Button
 *  60-80:  cmd+hover (underline)
 *  80-90:  click
 * 90-150:  show result file
 */
function getPhase(frame: number) {
  if (frame < 30) return "idle" as const;
  if (frame < 60) return "mouse-move" as const;
  if (frame < 80) return "cmd-hover" as const;
  if (frame < 90) return "click" as const;
  return "show-result" as const;
}

function CmdClickScene({ variant }: { variant: Variant }) {
  const frame = useCurrentFrame();
  const phase = getPhase(frame);
  const [handle] = useState(() => delayRender("Waiting for Monaco to load"));
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoNs | null>(null);
  const [ready, setReady] = useState(false);
  const prevContentRef = useRef<string>("");
  const decorationsRef =
    useRef<monacoNs.editor.IEditorDecorationsCollection | null>(null);

  // "Button" on line 2 is at columns 10-16: import { Button } from ...
  const BUTTON_LINE = 2;
  const BUTTON_COL_START = 10;
  const BUTTON_COL_END = 16;

  const resultFile = variant === "before" ? BUTTON_DTS : BUTTON_TSX;

  const onEditorMount = useCallback(
    (editor: monacoNs.editor.IStandaloneCodeEditor, m: typeof monacoNs) => {
      editorRef.current = editor;
      monacoRef.current = m;

      // Enable JSX/TSX support
      m.languages.typescript.typescriptDefaults.setCompilerOptions({
        jsx: m.languages.typescript.JsxEmit.React,
        allowJs: true,
        allowNonTsExtensions: true,
      });

      // Create model with .tsx URI so Monaco uses JSX tokenizer
      const tsxUri = m.Uri.parse("file:///App.tsx");
      const existing = m.editor.getModel(tsxUri);
      const model = existing ?? m.editor.createModel(APP_TSX, undefined, tsxUri);
      editor.setModel(model);

      m.editor.defineTheme("vscode-dark-plus", {
        base: "vs-dark",
        inherit: true,
        rules: [],
        colors: {
          "editor.background": VS.bg,
          "editor.lineHighlightBackground": "#2a2d2e",
          "editorLineNumber.foreground": VS.lineNumber,
          "editorCursor.foreground": "#aeafad",
        },
      });
      m.editor.setTheme("vscode-dark-plus");

      // Disable all symbol highlighting that could bleed to other occurrences
      editor.updateOptions({
        cursorStyle: "line",
        cursorBlinking: "hidden",
        occurrencesHighlight: "off" as unknown as undefined,
        selectionHighlight: false,
        renderLineHighlight: "none",
      });

      // Create decoration collection for Cmd+hover effect
      decorationsRef.current = editor.createDecorationsCollection([]);

      // Wait for Monaco to fully tokenize and paint syntax highlighting
      // before Remotion captures the first frame
      setTimeout(() => {
        requestAnimationFrame(() => {
          setReady(true);
          continueRender(handle);
        });
      }, 1000);
    },
    [handle],
  );

  // Update editor content based on phase
  const fileContent = phase === "show-result" ? resultFile : APP_TSX;

  // Determine the appropriate file URI for each phase
  const fileUri =
    phase === "show-result"
      ? variant === "before"
        ? "file:///Button.d.ts"
        : "file:///Button.tsx"
      : "file:///App.tsx";

  useEffect(() => {
    if (!ready || !editorRef.current || !monacoRef.current) return;

    if (fileContent !== prevContentRef.current) {
      const m = monacoRef.current;
      const uri = m.Uri.parse(fileUri);
      const existing = m.editor.getModel(uri);
      const model =
        existing ?? m.editor.createModel(fileContent, undefined, uri);
      if (existing) model.setValue(fileContent);
      editorRef.current.setModel(model);
      editorRef.current.setScrollTop(0);
      prevContentRef.current = fileContent;
    }
  }, [fileContent, fileUri, ready]);

  // Apply/remove Cmd+hover decoration on "Button"
  const isCmdHover = phase === "cmd-hover";

  useEffect(() => {
    if (!ready || !decorationsRef.current || !monacoRef.current) return;

    if (isCmdHover) {
      const m = monacoRef.current;
      decorationsRef.current.set([
        {
          range: new m.Range(
            BUTTON_LINE,
            BUTTON_COL_START,
            BUTTON_LINE,
            BUTTON_COL_END,
          ),
          options: {
            inlineClassName: "cmd-hover-link",
          },
        },
      ]);
    } else {
      decorationsRef.current.clear();
    }
  }, [isCmdHover, ready]);

  // Get pixel position of "Button" from Monaco
  const buttonCoords = useRef<{
    x: number;
    midX: number;
    endX: number;
    y: number;
    lineHeight: number;
  } | null>(null);

  useEffect(() => {
    if (!ready || !editorRef.current || !monacoRef.current) return;
    if (fileContent !== APP_TSX) return;

    const editor = editorRef.current;
    const m = monacoRef.current;
    const startPos = editor.getScrolledVisiblePosition({
      lineNumber: BUTTON_LINE,
      column: BUTTON_COL_START,
    });
    const endPos = editor.getScrolledVisiblePosition({
      lineNumber: BUTTON_LINE,
      column: BUTTON_COL_END,
    });
    const lineHeight = editor.getOption(m.editor.EditorOption.lineHeight);

    if (startPos && endPos) {
      buttonCoords.current = {
        x: startPos.left,
        midX: (startPos.left + endPos.left) / 2,
        endX: endPos.left,
        y: startPos.top,
        lineHeight,
      };
    }
  }, [fileContent, ready]);

  // Layout offsets: title(30) + tabs(35) + breadcrumbs(22) = 87 vertical, 48 horizontal (activity bar)
  const OX = 48;
  const OY = 87;

  const bc = buttonCoords.current;
  const targetX = bc ? OX + bc.midX : 160;
  const targetY = bc ? OY + bc.y + bc.lineHeight / 2 : 120;
  const startX = 550;
  const startY = 360;

  let mouseX = 0;
  let mouseY = 0;
  let showMouse = false;

  if (phase === "mouse-move") {
    const t = easeInOut((frame - 30) / 30);
    mouseX = lerp(startX, targetX, t);
    mouseY = lerp(startY, targetY, t);
    showMouse = true;
  } else if (phase === "cmd-hover" || phase === "click") {
    mouseX = targetX;
    mouseY = targetY;
    showMouse = true;
  }

  const showAnnotation = phase === "show-result";
  const isCorrect = variant === "after";

  // Tabs
  let activeTab = "App.tsx";
  let secondTab: string | null = null;
  if (phase === "show-result") {
    activeTab = variant === "before" ? "Button.d.ts" : "Button.tsx";
    secondTab = "App.tsx";
  }

  // Breadcrumb
  let breadcrumb = "apps › my-app › src › App.tsx";
  if (phase === "show-result") {
    breadcrumb =
      variant === "before"
        ? "node_modules › @packages › ui › dist › Button.d.ts"
        : "packages › ui › src › Button.tsx";
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: VS.bg,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Inject Cmd+hover CSS */}
      <style dangerouslySetInnerHTML={{ __html: CMD_HOVER_CSS }} />

      {/* ── Title bar ──────────────────────────── */}
      <div
        style={{
          height: 30,
          backgroundColor: VS.titleBarBg,
          display: "flex",
          alignItems: "center",
          paddingLeft: 12,
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: "#ff5f57",
            }}
          />
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: "#febc2e",
            }}
          />
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: "#28c840",
            }}
          />
        </div>
        <span style={{ color: "#999", fontSize: 13, marginLeft: 60 }}>
          my-app — Visual Studio Code
        </span>
      </div>

      <div style={{ display: "flex", flex: 1 }}>
        {/* ── Activity bar ─────────────────────── */}
        <div
          style={{
            width: 48,
            backgroundColor: VS.activityBarBg,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 12,
            gap: 20,
          }}
        >
          <ActivityIcon active>
            <path d="M17.5 0h-9L3 5.5V19c0 .83.67 1.5 1.5 1.5h13c.83 0 1.5-.67 1.5-1.5V1.5C19 .67 18.33 0 17.5 0zM9 1.5V6H4.5L9 1.5z" />
          </ActivityIcon>
          <ActivityIcon>
            <path d="M15.25 0a8.25 8.25 0 0 0-6.18 13.72L1 21.75l1.5 1.5 8.03-8.03A8.25 8.25 0 1 0 15.25 0zm0 15a6.75 6.75 0 1 1 0-13.5 6.75 6.75 0 0 1 0 13.5z" />
          </ActivityIcon>
          <ActivityIcon>
            <path d="M21.007 8.222A3.738 3.738 0 0 0 15.045 5.2a3.737 3.737 0 0 0 1.156 6.583 2.988 2.988 0 0 1-2.668 1.67h-2.99a4.456 4.456 0 0 0-2.989 1.165V7.519a3.738 3.738 0 1 0-1.494 0v8.963a3.737 3.737 0 1 0 1.816.318 2.989 2.989 0 0 1 2.666-1.653h2.99a4.484 4.484 0 0 0 4.223-3.041 3.738 3.738 0 0 0 3.252-5.884z" />
          </ActivityIcon>
        </div>

        {/* ── Editor column ────────────────────── */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {/* Tab bar */}
          <div
            style={{
              height: 35,
              backgroundColor: VS.tabBorder,
              display: "flex",
              alignItems: "stretch",
            }}
          >
            {secondTab && <EditorTab label={secondTab} active={false} />}
            <EditorTab label={activeTab} active />
            <div style={{ flex: 1 }} />
          </div>

          {/* Breadcrumbs */}
          <div
            style={{
              height: 22,
              backgroundColor: VS.bg,
              display: "flex",
              alignItems: "center",
              paddingLeft: 16,
              fontSize: 12,
              color: VS.breadcrumbText,
              opacity: 0.6,
              borderBottom: "1px solid #2d2d2d",
            }}
          >
            {breadcrumb}
          </div>

          {/* Monaco editor */}
          <div style={{ flex: 1, position: "relative" }}>
            <MonacoEditor
              theme="vs-dark"
              onMount={onEditorMount}
              options={{
                fontSize: 13,
                lineHeight: 20,
                fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
                minimap: { enabled: false },
                scrollbar: { vertical: "hidden", horizontal: "hidden" },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                renderLineHighlight: "none",
                lineNumbers: "on",
                glyphMargin: false,
                folding: false,
                contextmenu: false,
                readOnly: true,
                domReadOnly: true,
                cursorStyle: "line",
                cursorBlinking: "hidden",
                automaticLayout: true,
                scrollBeyondLastLine: false,
                padding: { top: 4, bottom: 4 },
                occurrencesHighlight: "off" as unknown as undefined,
                selectionHighlight: false,
                matchBrackets: "never",
                renderWhitespace: "none",
              }}
              loading={null}
            />
          </div>
        </div>
      </div>

      {/* ── Status bar ─────────────────────────── */}
      <div
        style={{
          height: 22,
          backgroundColor: VS.statusBarBg,
          display: "flex",
          alignItems: "center",
          paddingLeft: 10,
          paddingRight: 10,
          fontSize: 12,
          color: VS.statusBarText,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <span style={{ fontSize: 11 }}>⎇ main</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            fontSize: 11,
          }}
        >
          <span>Ln 2, Col 16</span>
          <span>Spaces: 2</span>
          <span>UTF-8</span>
          <span>TypeScript React</span>
        </div>
      </div>

      {/* ── Mouse cursor ──────────────────────── */}
      {showMouse && (
        <div
          style={{
            position: "absolute",
            left: mouseX,
            top: mouseY,
            zIndex: 200,
            pointerEvents: "none",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
          }}
        >
          {phase === "cmd-hover" ? (
            // Pointing hand cursor (like VS Code Cmd+hover)
            <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
              <path
                d="M7 8V3.5C7 2.67 7.67 2 8.5 2S10 2.67 10 3.5V8M10 7.5V2.5C10 1.67 10.67 1 11.5 1S13 1.67 13 2.5V7.5M13 7V4.5C13 3.67 13.67 3 14.5 3S16 3.67 16 4.5V12C16 16.42 12.42 20 8 20C4.69 20 1.89 17.85 0.81 14.85L0.5 14C0.18 13.12 0.6 12.15 1.47 11.81C2.22 11.52 3.07 11.8 3.5 12.44L4 13V7.5C4 6.67 4.67 6 5.5 6S7 6.67 7 7.5"
                fill="white"
                stroke="black"
                strokeWidth="0.7"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            // Normal arrow cursor
            <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
              <path
                d="M1 1L1 18L5.5 13.5L9.5 21L12.5 19.5L8.5 12L14 12L1 1Z"
                fill="white"
                stroke="black"
                strokeWidth="0.8"
              />
            </svg>
          )}
        </div>
      )}

      {/* ── Result annotation ─────────────────── */}
      {showAnnotation && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            right: 40,
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 6,
          }}
        >
          <div
            style={{
              backgroundColor: isCorrect
                ? "rgba(40, 200, 64, 0.12)"
                : "rgba(255, 95, 87, 0.12)",
              border: `1px solid ${isCorrect ? "#28c840" : "#ff5f57"}`,
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: isCorrect ? "#28c840" : "#ff5f57",
            }}
          >
            {isCorrect ? "✓ Jumped to source" : "✗ Jumped to declaration"}
          </div>
          <div style={{ fontSize: 11, color: "#888", paddingRight: 4 }}>
            {isCorrect
              ? "packages/ui/src/Button.tsx"
              : "node_modules/@packages/ui/dist/Button.d.ts"}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}

// ── Exported compositions ────────────────────────────────────────────

export function CmdClickBefore() {
  return <CmdClickScene variant="before" />;
}

export function CmdClickAfter() {
  return <CmdClickScene variant="after" />;
}

// Keep legacy combined export for backwards compat
export function CmdClick() {
  return <CmdClickScene variant="before" />;
}

// ── Sub-components ───────────────────────────────────────────────────

function EditorTab({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      style={{
        padding: "0 12px",
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 13,
        color: active ? "#ffffff" : "#999999",
        backgroundColor: active ? VS.tabActiveBg : VS.tabInactiveBg,
        borderRight: `1px solid ${VS.tabBorder}`,
        borderTop: active ? "1px solid #007acc" : "1px solid transparent",
      }}
    >
      <span style={{ color: "#519aba", fontSize: 11, fontWeight: 700 }}>
        TS
      </span>
      {label}
      <span style={{ color: "#666", fontSize: 15, marginLeft: 6 }}>×</span>
    </div>
  );
}

function ActivityIcon({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill={active ? "#ffffff" : "#858585"}
      style={{ opacity: active ? 1 : 0.5 }}
    >
      {children}
    </svg>
  );
}
