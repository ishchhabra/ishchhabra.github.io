import { useEffect, useState } from "react";
import { useTheme } from "../../../lib/theme";
import { diagramPalette } from "./diagramColors";

type Phase =
  | "idle" // Editor showing source file, cursor at rest
  | "hover" // Cursor moves to import, underline appears
  | "click" // Cmd+Click fires
  | "open-wrong" // .d.ts tab opens (broken)
  | "pause-wrong" // Hold on wrong result
  | "reset" // Fade back, switch to "with fix"
  | "hover-fix" // Cursor moves to import again
  | "click-fix" // Cmd+Click fires
  | "open-right" // .tsx source tab opens (correct)
  | "pause-right"; // Hold on correct result

const TIMINGS: Record<Phase, number> = {
  idle: 1200,
  hover: 800,
  click: 300,
  "open-wrong": 600,
  "pause-wrong": 2000,
  reset: 1000,
  "hover-fix": 800,
  "click-fix": 300,
  "open-right": 600,
  "pause-right": 2500,
};

const PHASE_ORDER: Phase[] = [
  "idle",
  "hover",
  "click",
  "open-wrong",
  "pause-wrong",
  "reset",
  "hover-fix",
  "click-fix",
  "open-right",
  "pause-right",
];

// ── Fake code content ────────────────────────────────────────────────

const SOURCE_LINES = [
  { text: "import ", dim: true },
  { text: "{ Button }", highlight: true },
  { text: " from ", dim: true },
  { text: '"@packages/ui"', importPath: true },
  { text: ";", dim: true },
];

const DTS_LINES = [
  "// node_modules/@packages/ui/dist/Button.d.ts",
  "",
  "export declare const Button: React.FC<{",
  "  children: React.ReactNode;",
  '  variant?: "primary" | "secondary";',
  "  onClick?: () => void;",
  "}>;",
];

const TSX_LINES = [
  "// packages/ui/src/Button.tsx",
  "",
  "export const Button: React.FC<ButtonProps> = ({",
  "  children,",
  '  variant = "primary",',
  "  onClick,",
  "}) => {",
  "  return (",
  "    <button className={styles[variant]} onClick={onClick}>",
  "      {children}",
  "    </button>",
  "  );",
  "};",
];

// ── Component ────────────────────────────────────────────────────────

export function CmdClickDemo() {
  const { theme } = useTheme();
  const c = diagramPalette[theme];
  const [phaseIdx, setPhaseIdx] = useState(0);

  const phase = PHASE_ORDER[phaseIdx]!;

  useEffect(() => {
    const timer = setTimeout(() => {
      setPhaseIdx((i) => (i + 1) % PHASE_ORDER.length);
    }, TIMINGS[phase]);
    return () => clearTimeout(timer);
  }, [phaseIdx, phase]);

  const isFixed =
    phase === "reset" ||
    phase === "hover-fix" ||
    phase === "click-fix" ||
    phase === "open-right" ||
    phase === "pause-right";
  const showImport =
    phase === "idle" ||
    phase === "hover" ||
    phase === "click" ||
    phase === "reset" ||
    phase === "hover-fix" ||
    phase === "click-fix";
  const showResult =
    phase === "open-wrong" ||
    phase === "pause-wrong" ||
    phase === "open-right" ||
    phase === "pause-right";
  const isHovering = phase === "hover" || phase === "hover-fix";
  const isCorrect = phase === "open-right" || phase === "pause-right";
  const resultLines = isCorrect ? TSX_LINES : DTS_LINES;
  const resultTab = isCorrect ? "Button.tsx" : "Button.d.ts";
  const resultTabColor = isCorrect ? c.green : c.red;

  return (
    <div className="my-8 flex justify-center">
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border"
        style={{ borderColor: c.border }}
      >
        {/* ── Title bar ─────────────────────────── */}
        <div
          className="flex items-center border-b px-3 py-2"
          style={{ backgroundColor: c.cardAlt, borderColor: c.border }}
        >
          <div className="flex items-center gap-1.5">
            <Dot color={c.red} />
            <Dot color={c.orange} />
            <Dot color={c.green} />
          </div>
          <div className="ml-3 flex items-center gap-0.5">
            {/* Source tab — always visible */}
            <Tab label="App.tsx" active={showImport} c={c} accentColor={c.blue} />
            {/* Result tab — slides in */}
            {showResult && <Tab label={resultTab} active c={c} accentColor={resultTabColor} />}
          </div>
          <div className="flex-1" />
          {/* Mode badge */}
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-medium transition-all duration-300"
            style={{
              backgroundColor: isFixed ? `${c.green}18` : `${c.caption}12`,
              color: isFixed ? c.green : c.caption,
            }}
          >
            {isFixed ? "with sourceRoot fix" : "default"}
          </span>
        </div>

        {/* ── Editor area ───────────────────────── */}
        <div
          className="relative overflow-hidden font-mono transition-opacity duration-300"
          style={{
            backgroundColor: c.canvas,
            minHeight: 220,
          }}
        >
          {/* Import view */}
          <div
            className="absolute inset-0 p-4 transition-all duration-300"
            style={{
              opacity: showImport ? 1 : 0,
              transform: showImport ? "translateX(0)" : "translateX(-20px)",
              pointerEvents: showImport ? "auto" : "none",
            }}
          >
            {/* Line numbers gutter */}
            <div className="flex gap-4">
              <div
                className="flex flex-col items-end text-[12px] leading-[1.7] select-none"
                style={{ color: c.caption, minWidth: 20 }}
              >
                {["1", "2", "3"].map((n) => (
                  <div key={n}>{n}</div>
                ))}
              </div>
              <div className="flex-1 text-[12px] leading-[1.7]">
                {/* Line 1: the import */}
                <div className="relative">
                  {SOURCE_LINES.map((part, i) => (
                    <span
                      key={i}
                      style={{
                        color: part.importPath
                          ? c.green
                          : part.highlight
                            ? c.blue
                            : part.dim
                              ? c.caption
                              : c.body,
                        textDecoration: part.importPath && isHovering ? "underline" : "none",
                        textDecorationColor: c.blue,
                        cursor: part.importPath && isHovering ? "pointer" : "default",
                      }}
                    >
                      {part.text}
                    </span>
                  ))}
                  {/* Animated cursor */}
                  {isHovering && (
                    <span
                      className="absolute text-[10px]"
                      style={{
                        color: c.caption,
                        top: -14,
                        left: 175,
                        opacity: 0.7,
                      }}
                    >
                      Cmd+Click
                    </span>
                  )}
                </div>
                {/* Line 2: blank */}
                <div>&nbsp;</div>
                {/* Line 3: usage */}
                <div>
                  <span style={{ color: c.caption }}>{"<"}</span>
                  <span style={{ color: c.blue }}>Button</span>
                  <span style={{ color: c.caption }}>{">"}</span>
                  <span style={{ color: c.body }}>Click me</span>
                  <span style={{ color: c.caption }}>{"</"}</span>
                  <span style={{ color: c.blue }}>Button</span>
                  <span style={{ color: c.caption }}>{">"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Result view (d.ts or tsx) */}
          <div
            className="absolute inset-0 p-4 transition-all duration-300"
            style={{
              opacity: showResult ? 1 : 0,
              transform: showResult ? "translateX(0)" : "translateX(20px)",
              pointerEvents: showResult ? "auto" : "none",
            }}
          >
            <div className="flex gap-4">
              <div
                className="flex flex-col items-end text-[12px] leading-[1.7] select-none"
                style={{ color: c.caption, minWidth: 20 }}
              >
                {resultLines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </div>
              <div className="flex-1 text-[12px] leading-[1.7]">
                {resultLines.map((line, i) => (
                  <div key={i} style={{ color: i === 0 ? c.caption : c.body }}>
                    {line || "\u00A0"}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Bottom status bar ─────────────────── */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t px-3 py-1"
            style={{
              backgroundColor: c.cardAlt,
              borderColor: c.border,
            }}
          >
            <span className="text-[10px]" style={{ color: c.caption }}>
              {showResult ? (
                <>
                  Jumped to{" "}
                  <span style={{ color: resultTabColor, fontWeight: 500 }}>
                    {isCorrect
                      ? "packages/ui/src/Button.tsx"
                      : "node_modules/@packages/ui/dist/Button.d.ts"}
                  </span>
                </>
              ) : (
                "apps/my-app/src/App.tsx"
              )}
            </span>
            {showResult && (
              <span
                className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                style={{
                  backgroundColor: isCorrect ? `${c.green}18` : `${c.red}18`,
                  color: isCorrect ? c.green : c.red,
                }}
              >
                {isCorrect ? "Source file" : "Declaration only"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────

function Dot({ color }: { color: string }) {
  return (
    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color, opacity: 0.5 }} />
  );
}

type Palette = (typeof diagramPalette)[keyof typeof diagramPalette];

function Tab({
  label,
  active,
  c,
  accentColor,
}: {
  label: string;
  active: boolean;
  c: Palette;
  accentColor: string;
}) {
  return (
    <div
      className="relative border-r px-3 py-1 text-[11px] font-medium"
      style={{
        color: active ? c.heading : c.caption,
        backgroundColor: active ? c.canvas : "transparent",
        borderColor: c.border,
      }}
    >
      {label}
      {active && (
        <div
          className="absolute top-0 right-0 left-0 h-[2px]"
          style={{ backgroundColor: accentColor }}
        />
      )}
    </div>
  );
}
