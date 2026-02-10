import { useTheme } from "../../../contexts/ThemeContext";
import { diagramPalette } from "./diagramColors";

/**
 * SVG illustration: Monorepo structure — apps consuming shared packages.
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
        viewBox="0 0 600 260"
        className="w-full max-w-xl"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="600" height="260" rx="16" fill={c.canvas} />

        {/* Root */}
        <rect
          x="220"
          y="20"
          width="160"
          height="40"
          rx="8"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="300" y="45" textAnchor="middle" fill={c.heading} fontSize="12" fontWeight="600">
          my-monorepo/
        </text>

        {/* Apps group */}
        <rect
          x="30"
          y="100"
          width="240"
          height="130"
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
          width="95"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="97" y="154" textAnchor="middle" fill={c.blue} fontSize="10" fontWeight="500">
          web-app
        </text>

        <rect
          x="155"
          y="132"
          width="95"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="202" y="154" textAnchor="middle" fill={c.blue} fontSize="10" fontWeight="500">
          admin
        </text>

        <rect
          x="50"
          y="178"
          width="95"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="97" y="200" textAnchor="middle" fill={c.blue} fontSize="10" fontWeight="500">
          mobile
        </text>

        {/* Packages group */}
        <rect
          x="330"
          y="100"
          width="240"
          height="130"
          rx="10"
          fill={c.cardAlt}
          stroke={c.border}
          strokeWidth="1"
        />
        <text
          x="350"
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
          x="350"
          y="132"
          width="95"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="397" y="154" textAnchor="middle" fill={c.purple} fontSize="10" fontWeight="500">
          ui
        </text>

        <rect
          x="455"
          y="132"
          width="95"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="502" y="154" textAnchor="middle" fill={c.purple} fontSize="10" fontWeight="500">
          shared
        </text>

        <rect
          x="350"
          y="178"
          width="95"
          height="36"
          rx="6"
          fill={c.card}
          stroke={c.border}
          strokeWidth="1"
        />
        <text x="397" y="200" textAnchor="middle" fill={c.purple} fontSize="10" fontWeight="500">
          config
        </text>

        {/* Connection lines */}
        <line x1="250" y1="60" x2="150" y2="100" stroke={c.border} strokeWidth="1" />
        <line x1="350" y1="60" x2="450" y2="100" stroke={c.border} strokeWidth="1" />

        {/* Dependency arrows: apps → packages */}
        <line
          x1="155"
          y1="150"
          x2="350"
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
