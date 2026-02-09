/**
 * SVG illustration: Monorepo structure — apps consuming shared packages.
 */
export function MonorepoStructureDiagram() {
  return (
    <div className="my-8 flex justify-center">
      <svg
        viewBox="0 0 600 260"
        className="w-full max-w-xl"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="600" height="260" rx="16" fill="#0d1117" />

        {/* Root */}
        <rect
          x="220"
          y="20"
          width="160"
          height="40"
          rx="8"
          fill="#1a1a2e"
          stroke="#6366f1"
          strokeWidth="1"
          strokeOpacity="0.3"
        />
        <text x="300" y="45" textAnchor="middle" fill="#a5b4fc" fontSize="12" fontWeight="600">
          my-monorepo/
        </text>

        {/* Apps group */}
        <rect
          x="30"
          y="100"
          width="240"
          height="130"
          rx="10"
          fill="#0f172a"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeOpacity="0.15"
        />
        <text
          x="50"
          y="120"
          fill="#3b82f6"
          fontSize="10"
          fontWeight="600"
          letterSpacing="0.1em"
          opacity="0.6"
        >
          APPS
        </text>

        <rect
          x="50"
          y="132"
          width="95"
          height="36"
          rx="6"
          fill="#1e293b"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <text x="97" y="154" textAnchor="middle" fill="#93c5fd" fontSize="10" fontWeight="500">
          web-app
        </text>

        <rect
          x="155"
          y="132"
          width="95"
          height="36"
          rx="6"
          fill="#1e293b"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <text x="202" y="154" textAnchor="middle" fill="#93c5fd" fontSize="10" fontWeight="500">
          admin
        </text>

        <rect
          x="50"
          y="178"
          width="95"
          height="36"
          rx="6"
          fill="#1e293b"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <text x="97" y="200" textAnchor="middle" fill="#93c5fd" fontSize="10" fontWeight="500">
          mobile
        </text>

        {/* Packages group */}
        <rect
          x="330"
          y="100"
          width="240"
          height="130"
          rx="10"
          fill="#0f172a"
          stroke="#a78bfa"
          strokeWidth="1"
          strokeOpacity="0.15"
        />
        <text
          x="350"
          y="120"
          fill="#a78bfa"
          fontSize="10"
          fontWeight="600"
          letterSpacing="0.1em"
          opacity="0.6"
        >
          PACKAGES
        </text>

        <rect
          x="350"
          y="132"
          width="95"
          height="36"
          rx="6"
          fill="#1e293b"
          stroke="#a78bfa"
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <text x="397" y="154" textAnchor="middle" fill="#c4b5fd" fontSize="10" fontWeight="500">
          ui
        </text>

        <rect
          x="455"
          y="132"
          width="95"
          height="36"
          rx="6"
          fill="#1e293b"
          stroke="#a78bfa"
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <text x="502" y="154" textAnchor="middle" fill="#c4b5fd" fontSize="10" fontWeight="500">
          shared
        </text>

        <rect
          x="350"
          y="178"
          width="95"
          height="36"
          rx="6"
          fill="#1e293b"
          stroke="#a78bfa"
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <text x="397" y="200" textAnchor="middle" fill="#c4b5fd" fontSize="10" fontWeight="500">
          config
        </text>

        {/* Connection lines */}
        <line
          x1="250"
          y1="60"
          x2="150"
          y2="100"
          stroke="#3b82f6"
          strokeWidth="1"
          strokeOpacity="0.2"
        />
        <line
          x1="350"
          y1="60"
          x2="450"
          y2="100"
          stroke="#a78bfa"
          strokeWidth="1"
          strokeOpacity="0.2"
        />

        {/* Dependency arrows: apps → packages */}
        <line
          x1="155"
          y1="150"
          x2="350"
          y2="150"
          stroke="#22d3ee"
          strokeWidth="1"
          strokeDasharray="4 3"
          strokeOpacity="0.3"
        />
      </svg>
    </div>
  );
}
