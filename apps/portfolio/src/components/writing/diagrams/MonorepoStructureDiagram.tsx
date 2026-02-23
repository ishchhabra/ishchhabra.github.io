import { useTheme } from "../../../contexts/ThemeContext";
import { diagramPalette } from "./diagramColors";

/**
 * SVG illustration: Simple monorepo structure — one app consuming one shared package.
 *
 * Box borders use the neutral `border` color. Color comes from section labels
 * and text (blue = apps, purple = packages).
 */
export function MonorepoStructureDiagram() {
  const { theme } = useTheme();
  const c = diagramPalette[theme];

  return (
    <div className="my-8 flex justify-center">
      <svg
        viewBox="0 0 440 200"
        className="w-full max-w-md"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="440" height="200" rx="16" fill={c.canvas} />

        {/* Root */}
        <rect
          x="150"
          y="20"
          width="140"
          height="40"
          rx="8"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="220" y="45" textAnchor="middle" fill={c.heading} fontSize="12" fontWeight="600">
          my-monorepo/
        </text>

        {/* Apps group */}
        <rect
          x="30"
          y="100"
          width="160"
          height="80"
          rx="10"
          fill={c.cardAlt}
          stroke={c.border}
          strokeWidth="1"
        />
        <text
          x="50"
          y="120"
          fill={c.blue}
          fontSize="10"
          fontWeight="600"
          letterSpacing="0.1em"
          opacity="0.8"
        >
          APPS
        </text>

        <rect
          x="50"
          y="132"
          width="120"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="110" y="154" textAnchor="middle" fill={c.blue} fontSize="10" fontWeight="500">
          my-app
        </text>

        {/* Packages group */}
        <rect
          x="250"
          y="100"
          width="160"
          height="80"
          rx="10"
          fill={c.cardAlt}
          stroke={c.border}
          strokeWidth="1"
        />
        <text
          x="270"
          y="120"
          fill={c.purple}
          fontSize="10"
          fontWeight="600"
          letterSpacing="0.1em"
          opacity="0.8"
        >
          PACKAGES
        </text>

        <rect
          x="270"
          y="132"
          width="120"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="330" y="154" textAnchor="middle" fill={c.purple} fontSize="10" fontWeight="500">
          ui
        </text>

        {/* Connection lines: root → groups */}
        <line x1="185" y1="60" x2="110" y2="100" stroke={c.border} strokeWidth="1" />
        <line x1="255" y1="60" x2="330" y2="100" stroke={c.border} strokeWidth="1" />

        {/* Dependency arrow: app → package */}
        <line
          x1="170"
          y1="150"
          x2="270"
          y2="150"
          stroke={c.arrow}
          strokeWidth="1"
          strokeDasharray="4 3"
          strokeOpacity="0.4"
        />
      </svg>
    </div>
  );
}
