import { useTheme } from "../../../contexts/ThemeContext";
import { diagramPalette } from "./diagramColors";

/**
 * SVG illustration: Node resolution walkthrough — detailed step by step.
 * Timeline with proper vertical line that doesn't extend past the last item.
 */
export function NodeResolutionDiagram() {
  const { theme } = useTheme();
  const c = diagramPalette[theme];

  const steps = [
    {
      n: "1",
      label: "Your app imports @packages/shared",
      sub: "Symlink resolves to packages/shared/dist/",
      color: c.blue,
    },
    {
      n: "2",
      label: 'Shared code runs require("X")',
      sub: "Node begins module resolution",
      color: c.purple,
    },
    {
      n: "3",
      label: "Node resolves from the symlink target",
      sub: "Starting directory: packages/shared/ (not apps/my-app/)",
      color: c.purple,
    },
    {
      n: "4",
      label: "Walks up: packages/shared/node_modules/X",
      sub: "Found! This is X @ 1.0 — the package's devDependency",
      color: c.orange,
    },
    {
      n: "5",
      label: "Resolution stops. Node never checks the app.",
      sub: "apps/my-app/node_modules/X (v2.0) is never reached",
      color: c.red,
    },
    {
      n: "6",
      label: "Two copies of X in memory",
      sub: "v1.0 from the package + v2.0 from the app = broken state",
      color: c.red,
    },
  ];

  const stepH = 56;
  const startY = 50;
  const totalH = startY + steps.length * stepH + 10;

  return (
    <div className="my-8 flex justify-center">
      <svg
        viewBox={`0 0 560 ${totalH}`}
        className="w-full max-w-lg"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="560" height={totalH} rx="16" fill={c.canvas} />

        <text
          x="280"
          y="30"
          textAnchor="middle"
          fill={c.body}
          fontSize="11"
          fontWeight="600"
          letterSpacing="0.1em"
        >
          NODE MODULE RESOLUTION (SYMLINKS)
        </text>

        {/* Vertical line — from first circle center to last circle center */}
        <line
          x1="60"
          y1={startY + 14}
          x2="60"
          y2={startY + (steps.length - 1) * stepH + 14}
          stroke={c.border}
          strokeWidth="2"
        />

        {steps.map((step, i) => {
          const y = startY + i * stepH;
          return (
            <g key={step.n}>
              {/* Background circle to cover the line */}
              <circle cx="60" cy={y + 14} r="14" fill={c.canvas} />
              {/* Visible circle */}
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
              <text x="88" y={y + 12} fill={c.heading} fontSize="12" fontWeight="600">
                {step.label}
              </text>
              <text x="88" y={y + 28} fill={c.caption} fontSize="10">
                {step.sub}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * SVG illustration: Injected resolution — correct behavior.
 *
 * Box strokes use the neutral `border` color so dark mode stays light/airy.
 * Color differentiation comes from text labels (blue = App A, purple = App B / shared).
 */
export function InjectedDiagram() {
  const { theme } = useTheme();
  const c = diagramPalette[theme];

  return (
    <div className="my-8 flex justify-center">
      <svg
        viewBox="0 0 720 340"
        className="w-full max-w-2xl"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="720" height="340" rx="16" fill={c.canvas} />

        {/* App A (dep X v2.0) */}
        <rect
          x="40"
          y="40"
          width="200"
          height="80"
          rx="10"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="140" y="70" textAnchor="middle" fill={c.blue} fontSize="13" fontWeight="600">
          App A
        </text>
        <text x="140" y="92" textAnchor="middle" fill={c.caption} fontSize="11">
          dep X @ 2.0
        </text>

        {/* Copy of shared inside App A */}
        <rect
          x="60"
          y="160"
          width="160"
          height="52"
          rx="8"
          fill={c.cardAlt}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="140" y="183" textAnchor="middle" fill={c.purple} fontSize="10" fontWeight="500">
          @packages/shared (copy)
        </text>
        <text x="140" y="197" textAnchor="middle" fill={c.caption} fontSize="9">
          hard-linked into app
        </text>

        {/* App A's dep X */}
        <rect
          x="60"
          y="248"
          width="160"
          height="48"
          rx="8"
          fill={c.cardAlt}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="140" y="268" textAnchor="middle" fill={c.heading} fontSize="11" fontWeight="500">
          node_modules/X
        </text>
        <text x="140" y="284" textAnchor="middle" fill={c.green} fontSize="12" fontWeight="700">
          v2.0 ✓
        </text>

        {/* App B (dep X v3.0) */}
        <rect
          x="480"
          y="40"
          width="200"
          height="80"
          rx="10"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="580" y="70" textAnchor="middle" fill={c.purple} fontSize="13" fontWeight="600">
          App B
        </text>
        <text x="580" y="92" textAnchor="middle" fill={c.caption} fontSize="11">
          dep X @ 3.0
        </text>

        {/* Copy of shared inside App B */}
        <rect
          x="500"
          y="160"
          width="160"
          height="52"
          rx="8"
          fill={c.cardAlt}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="580" y="183" textAnchor="middle" fill={c.purple} fontSize="10" fontWeight="500">
          @packages/shared (copy)
        </text>
        <text x="580" y="197" textAnchor="middle" fill={c.caption} fontSize="9">
          hard-linked into app
        </text>

        {/* App B's dep X */}
        <rect
          x="500"
          y="248"
          width="160"
          height="48"
          rx="8"
          fill={c.cardAlt}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="580" y="268" textAnchor="middle" fill={c.heading} fontSize="11" fontWeight="500">
          node_modules/X
        </text>
        <text x="580" y="284" textAnchor="middle" fill={c.green} fontSize="12" fontWeight="700">
          v3.0 ✓
        </text>

        {/* Arrows: app → copy */}
        <line
          x1="140"
          y1="120"
          x2="140"
          y2="156"
          stroke={c.arrow}
          strokeWidth="1.5"
          markerEnd="url(#arr)"
        />
        <line
          x1="580"
          y1="120"
          x2="580"
          y2="156"
          stroke={c.arrow}
          strokeWidth="1.5"
          markerEnd="url(#arr)"
        />

        {/* Arrows: copy → dep */}
        <line
          x1="140"
          y1="212"
          x2="140"
          y2="244"
          stroke={c.arrow}
          strokeWidth="1.5"
          markerEnd="url(#arr)"
        />
        <line
          x1="580"
          y1="212"
          x2="580"
          y2="244"
          stroke={c.arrow}
          strokeWidth="1.5"
          markerEnd="url(#arr)"
        />

        {/* Labels */}
        <text x="155" y="142" fill={c.purple} fontSize="9" opacity="0.6">
          injected
        </text>
        <text x="595" y="142" fill={c.purple} fontSize="9" opacity="0.6">
          injected
        </text>
        <text x="155" y="234" fill={c.green} fontSize="9" opacity="0.6">
          resolves
        </text>
        <text x="595" y="234" fill={c.green} fontSize="9" opacity="0.6">
          resolves
        </text>

        {/* Center label */}
        <rect
          x="270"
          y="150"
          width="180"
          height="44"
          rx="10"
          fill={c.successBg}
          fillOpacity="0.4"
          stroke={c.successBorder}
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <text
          x="360"
          y="170"
          textAnchor="middle"
          fill={c.successText}
          fontSize="11"
          fontWeight="600"
        >
          Each app gets its own
        </text>
        <text
          x="360"
          y="185"
          textAnchor="middle"
          fill={c.successText}
          fontSize="11"
          fontWeight="600"
        >
          version of X ✓
        </text>

        <defs>
          <marker
            id="arr"
            viewBox="0 0 10 7"
            refX="9"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill={c.arrow} />
          </marker>
        </defs>
      </svg>
    </div>
  );
}
