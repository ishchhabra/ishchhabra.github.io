/**
 * Two diagrams for the "Making it work" section:
 *
 * 1. SyncBeforeAfterDiagram — before/after view of consumer's node_modules
 *    (used after Problem 1: prepare)
 *
 * 2. SyncLifecycleDiagram — vertical timeline of the full prepare chain
 *    (used after Problem 2: pnpm-sync)
 */

/* ------------------------------------------------------------------ */
/*  Before / After                                                     */
/* ------------------------------------------------------------------ */

export function SyncBeforeAfterDiagram() {
  const w = 640;
  const h = 220;
  const colW = 210;
  const gap = 130;
  const leftX = (w - colW * 2 - gap) / 2;
  const rightX = leftX + colW + gap;
  const treeY = 70;

  const FileEntry = ({
    x,
    y,
    label,
    dimmed,
    missing,
  }: {
    x: number;
    y: number;
    label: string;
    dimmed?: boolean;
    missing?: boolean;
  }) => (
    <g opacity={dimmed ? 0.3 : 1}>
      <text
        x={x}
        y={y}
        fill={missing ? "#f87171" : "#94a3b8"}
        fontSize="11"
        fontFamily="monospace"
        textDecoration={missing ? "line-through" : undefined}
      >
        {label}
      </text>
    </g>
  );

  return (
    <div className="my-8 flex justify-center">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full max-w-xl"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width={w} height={h} rx="16" fill="#0d1117" />

        {/* Left: After install */}
        <text
          x={leftX + colW / 2}
          y="30"
          textAnchor="middle"
          fill="#f59e0b"
          fontSize="11"
          fontWeight="600"
          letterSpacing="0.05em"
        >
          AFTER INSTALL
        </text>
        <rect x={leftX} y="42" width={colW} height="1" fill="#f59e0b" fillOpacity="0.2" />

        <text
          x={leftX + 8}
          y={treeY}
          fill="#e2e8f0"
          fontSize="11"
          fontFamily="monospace"
          fontWeight="600"
        >
          node_modules/@packages/ui/
        </text>
        <FileEntry x={leftX + 20} y={treeY + 22} label="├─ package.json" />
        <FileEntry x={leftX + 20} y={treeY + 42} label="└─ dist/" dimmed missing />

        <rect
          x={leftX}
          y={treeY + 64}
          width={colW}
          height="28"
          rx="6"
          fill="#451a03"
          fillOpacity="0.4"
          stroke="#f59e0b"
          strokeWidth="1"
          strokeOpacity="0.25"
        />
        <text
          x={leftX + colW / 2}
          y={treeY + 82}
          textAnchor="middle"
          fill="#fbbf24"
          fontSize="10"
          fontWeight="500"
        >
          dist/ doesn't exist yet
        </text>

        {/* Arrow */}
        {(() => {
          const arrowY = treeY + 30;
          const x1 = leftX + colW + 16;
          const x2 = rightX - 16;
          const mid = (x1 + x2) / 2;
          return (
            <g>
              <line
                x1={x1}
                y1={arrowY}
                x2={x2 - 6}
                y2={arrowY}
                stroke="#64748b"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <path
                d={`M${x2 - 8} ${arrowY - 4} L${x2} ${arrowY} L${x2 - 8} ${arrowY + 4}`}
                stroke="#64748b"
                strokeWidth="1.5"
                fill="none"
              />
              <text
                x={mid}
                y={arrowY - 10}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9"
                fontWeight="500"
              >
                prepare → build
              </text>
            </g>
          );
        })()}

        {/* Right: After prepare */}
        <text
          x={rightX + colW / 2}
          y="30"
          textAnchor="middle"
          fill="#22c55e"
          fontSize="11"
          fontWeight="600"
          letterSpacing="0.05em"
        >
          AFTER PREPARE
        </text>
        <rect x={rightX} y="42" width={colW} height="1" fill="#22c55e" fillOpacity="0.2" />

        <text
          x={rightX + 8}
          y={treeY}
          fill="#e2e8f0"
          fontSize="11"
          fontFamily="monospace"
          fontWeight="600"
        >
          node_modules/@packages/ui/
        </text>
        <FileEntry x={rightX + 20} y={treeY + 22} label="├─ package.json" />
        <FileEntry x={rightX + 20} y={treeY + 42} label="├─ dist/" />
        <FileEntry x={rightX + 36} y={treeY + 60} label="├─ index.js" />
        <FileEntry x={rightX + 36} y={treeY + 78} label="└─ index.d.ts" />

        <rect
          x={rightX}
          y={treeY + 100}
          width={colW}
          height="28"
          rx="6"
          fill="#052e16"
          fillOpacity="0.4"
          stroke="#22c55e"
          strokeWidth="1"
          strokeOpacity="0.25"
        />
        <text
          x={rightX + colW / 2}
          y={treeY + 118}
          textAnchor="middle"
          fill="#4ade80"
          fontSize="10"
          fontWeight="500"
        >
          dist/ built automatically ✓
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lifecycle timeline                                                 */
/* ------------------------------------------------------------------ */

export function SyncLifecycleDiagram() {
  const steps = [
    {
      n: "1",
      label: "pnpm install",
      sub: "Resolves deps, creates injected copies",
      color: "#3b82f6",
    },
    { n: "2", label: "prepare", sub: "Runs automatically on install", color: "#8b5cf6" },
    { n: "3", label: "sync:prepare", sub: "Writes .pnpm-sync.json config", color: "#8b5cf6" },
    { n: "4", label: "build (tsc)", sub: "Creates dist/", color: "#8b5cf6" },
    { n: "5", label: "postbuild", sub: "pnpm-sync copy → syncs to consumers", color: "#22c55e" },
  ];

  const stepH = 52;
  const startY = 50;
  const lastStepY = startY + (steps.length - 1) * stepH;
  const resultY = lastStepY + 56;
  const totalH = resultY + 44;

  return (
    <div className="my-8 flex justify-center">
      <svg
        viewBox={`0 0 480 ${totalH}`}
        className="w-full max-w-md"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="480" height={totalH} rx="16" fill="#0d1117" />

        {/* Title */}
        <text
          x="240"
          y="30"
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="11"
          fontWeight="600"
          letterSpacing="0.1em"
        >
          FRESH CLONE LIFECYCLE
        </text>

        {/* Vertical line */}
        <line x1="60" y1={startY} x2="60" y2={lastStepY + 14} stroke="#1e293b" strokeWidth="2" />

        {/* Bracket spanning steps 2–5 (prepare chain) */}
        <line
          x1="36"
          y1={startY + 1 * stepH + 4}
          x2="36"
          y2={lastStepY + 24}
          stroke="#8b5cf6"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />
        <line
          x1="36"
          y1={startY + 1 * stepH + 4}
          x2="42"
          y2={startY + 1 * stepH + 4}
          stroke="#8b5cf6"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />
        <line
          x1="36"
          y1={lastStepY + 24}
          x2="42"
          y2={lastStepY + 24}
          stroke="#8b5cf6"
          strokeWidth="1.5"
          strokeOpacity="0.35"
        />

        {steps.map((step, i) => {
          const y = startY + i * stepH;
          return (
            <g key={step.n}>
              <circle
                cx="60"
                cy={y + 14}
                r="12"
                fill={step.color}
                fillOpacity="0.15"
                stroke={step.color}
                strokeWidth="1.5"
                strokeOpacity="0.5"
              />
              <text
                x="60"
                y={y + 18}
                textAnchor="middle"
                fill={step.color}
                fontSize="11"
                fontWeight="700"
              >
                {step.n}
              </text>
              <text x="90" y={y + 12} fill="#e2e8f0" fontSize="13" fontWeight="600">
                {step.label}
              </text>
              <text x="90" y={y + 28} fill="#64748b" fontSize="11">
                {step.sub}
              </text>
            </g>
          );
        })}

        {/* Result bar */}
        <rect
          x="60"
          y={resultY}
          width="360"
          height="32"
          rx="8"
          fill="#052e16"
          fillOpacity="0.4"
          stroke="#22c55e"
          strokeWidth="1"
          strokeOpacity="0.3"
        />
        <text
          x="240"
          y={resultY + 20}
          textAnchor="middle"
          fill="#4ade80"
          fontSize="11"
          fontWeight="600"
        >
          Consumers have built output ✓
        </text>
      </svg>
    </div>
  );
}
