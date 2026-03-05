import { useTheme } from "../../../lib/theme";
import { diagramPalette } from "./diagramColors";

/**
 * Visual directory-tree diagram showing how Node resolves imports
 * from a symlinked workspace package — and why it finds the wrong copy.
 */
export function ResolutionPathDiagram() {
  const { theme } = useTheme();
  const c = diagramPalette[theme];

  return (
    <div className="my-8 flex justify-center">
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border"
        style={{ borderColor: c.border, backgroundColor: c.canvas }}
      >
        {/* Header */}
        <div
          className="border-b px-5 py-3"
          style={{ borderColor: c.border, backgroundColor: c.cardAlt }}
        >
          <span
            className="text-[10px] font-semibold tracking-[0.15em] uppercase"
            style={{ color: c.caption }}
          >
            How Node resolves require("react")
          </span>
        </div>

        {/* Tree content */}
        <div className="px-5 py-5">
          {/* Package resolution — where Node actually looks */}
          <div className="font-mono text-[12.5px] leading-[2]">
            {/* packages/ui/ */}
            <div style={{ color: c.heading }} className="font-medium">
              packages/ui/
            </div>

            {/* dist/index.js — resolution starts */}
            <div className="flex items-center gap-3 pl-5">
              <span style={{ color: c.body }}>
                <TreeChar type="branch" c={c} />
                dist/index.js
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${c.blue}15`,
                  color: c.blue,
                }}
              >
                require("react") starts here
              </span>
            </div>

            {/* Arrow showing walk-up */}
            <div className="pl-5" style={{ color: c.arrow }}>
              <TreeChar type="pipe" c={c} />
              <span className="pl-2 text-[10px] italic" style={{ color: c.caption }}>
                Node walks up...
              </span>
            </div>

            {/* node_modules/react — FOUND */}
            <div className="flex items-center gap-3 pl-5">
              <span style={{ color: c.body }}>
                <TreeChar type="last" c={c} />
                node_modules/react
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  backgroundColor: `${c.orange}15`,
                  color: c.orange,
                }}
              >
                Found — stops here
              </span>
            </div>
          </div>

          {/* Divider — resolution boundary */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1" style={{ borderTop: `1px dashed ${c.border}` }} />
            <span
              className="text-[9px] font-medium tracking-widest uppercase"
              style={{ color: c.caption }}
            >
              never reaches
            </span>
            <div className="h-px flex-1" style={{ borderTop: `1px dashed ${c.border}` }} />
          </div>

          {/* App resolution — where the app's copy lives */}
          <div className="font-mono text-[12.5px] leading-[2] opacity-45">
            <div style={{ color: c.heading }} className="font-medium">
              apps/my-app/
            </div>
            <div className="flex items-center gap-3 pl-5">
              <span style={{ color: c.body }}>
                <TreeChar type="last" c={c} />
                node_modules/react
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${c.red}15`,
                  color: c.red,
                }}
              >
                the app's copy
              </span>
            </div>
          </div>

          {/* Bottom summary */}
          <div
            className="mt-5 rounded-lg border p-3 text-center text-[11.5px] leading-relaxed"
            style={{
              borderColor: c.border,
              backgroundColor: c.cardAlt,
              color: c.body,
            }}
          >
            Even if both are the{" "}
            <span style={{ color: c.heading }} className="font-semibold">
              exact same version
            </span>
            , Node loads them as separate modules.
            <br />
            Two Reacts in memory. Two dispatchers. Two Context trees.
          </div>
        </div>
      </div>
    </div>
  );
}

function TreeChar({
  type,
  c,
}: {
  type: "branch" | "pipe" | "last";
  c: (typeof diagramPalette)[keyof typeof diagramPalette];
}) {
  const chars = { branch: "\u251C\u2500\u2500 ", pipe: "\u2502", last: "\u2514\u2500\u2500 " };
  return <span style={{ color: c.border }}>{chars[type]}</span>;
}
