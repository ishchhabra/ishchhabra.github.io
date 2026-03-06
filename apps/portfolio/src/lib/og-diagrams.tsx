/**
 * Diagram renderers for OG image generation.
 *
 * SVG-based diagrams: rendered via renderToStaticMarkup → extract <svg> → data URI → @vercel/og
 * HTML-based diagrams (ResolutionPathDiagram): direct Satori JSX → @vercel/og
 */

import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InjectedDiagram } from "../components/writing/pnpm-monorepo/SymlinkDiagram";
import { NodeResolutionDiagram } from "../components/writing/pnpm-monorepo/SymlinkDiagram";
import {
  SyncBeforeAfterDiagram,
  SyncLifecycleDiagram,
} from "../components/writing/pnpm-monorepo/SyncLifecycleDiagram";
import { diagramPalette } from "../components/writing/pnpm-monorepo/diagramColors";
import { StaticThemeProvider } from "./theme";

function renderSvgComponent(Component: () => ReactNode): string {
  const html = renderToStaticMarkup(
    <StaticThemeProvider theme="light">
      <Component />
    </StaticThemeProvider>,
  );
  const match = html.match(/<svg[\s\S]*<\/svg>/);
  if (!match) {
    throw new Error("No SVG found in rendered output");
  }
  return match[0];
}

/* ------------------------------------------------------------------ */
/*  ResolutionPathDiagram — Satori-compatible rewrite (HTML/CSS only) */
/* ------------------------------------------------------------------ */

const c = diagramPalette.light;

function ResolutionPathDiagramOG(): ReactElement {
  const treeStyle = {
    display: "flex",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 2,
    flexDirection: "column" as const,
  };

  const badgeBase = {
    display: "flex",
    borderRadius: 999,
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 500,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 560,
        backgroundColor: c.canvas,
        borderRadius: 16,
        border: `1px solid ${c.border}`,
        overflow: "hidden",
        fontFamily: "sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          padding: "12px 20px",
          borderBottom: `1px solid ${c.border}`,
          backgroundColor: c.cardAlt,
        }}
      >
        <span
          style={{
            color: c.caption,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.15em",
            textTransform: "uppercase" as const,
          }}
        >
          How Node resolves require("react")
        </span>
      </div>

      {/* Tree content */}
      <div style={{ display: "flex", flexDirection: "column", padding: "20px" }}>
        <div style={treeStyle}>
          <div style={{ color: c.heading, fontWeight: 600 }}>packages/ui/</div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 20 }}>
            <span style={{ color: c.body }}>
              <span style={{ color: c.border }}>{"├── "}</span>
              dist/index.js
            </span>
            <span style={{ ...badgeBase, backgroundColor: `${c.blue}15`, color: c.blue }}>
              require("react") starts here
            </span>
          </div>

          <div style={{ display: "flex", paddingLeft: 20 }}>
            <span style={{ color: c.border }}>{"│"}</span>
            <span
              style={{
                paddingLeft: 8,
                fontSize: 10,
                fontStyle: "italic",
                color: c.caption,
              }}
            >
              Node walks up...
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 20 }}>
            <span style={{ color: c.body }}>
              <span style={{ color: c.border }}>{"└── "}</span>
              node_modules/react
            </span>
            <span
              style={{
                ...badgeBase,
                backgroundColor: `${c.orange}15`,
                color: c.orange,
                fontWeight: 600,
              }}
            >
              Found — stops here
            </span>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "16px 0",
          }}
        >
          <div style={{ flex: 1, borderTop: `1px dashed ${c.border}` }} />
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.15em",
              textTransform: "uppercase" as const,
              color: c.caption,
            }}
          >
            never reaches
          </span>
          <div style={{ flex: 1, borderTop: `1px dashed ${c.border}` }} />
        </div>

        {/* App resolution */}
        <div style={{ ...treeStyle, opacity: 0.45 }}>
          <div style={{ color: c.heading, fontWeight: 600 }}>apps/my-app/</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 20 }}>
            <span style={{ color: c.body }}>
              <span style={{ color: c.border }}>{"└── "}</span>
              node_modules/react
            </span>
            <span
              style={{
                ...badgeBase,
                backgroundColor: `${c.red}15`,
                color: c.red,
              }}
            >
              the app's copy
            </span>
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 20,
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            backgroundColor: c.cardAlt,
            padding: 12,
            textAlign: "center" as const,
            fontSize: 11,
            lineHeight: 1.6,
            color: c.body,
          }}
        >
          <span>
            Even if both are the{" "}
            <span style={{ color: c.heading, fontWeight: 600 }}>exact same version</span>, Node
            loads them as separate modules.
          </span>
          <span>Two Reacts in memory. Two dispatchers. Two Context trees.</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Registry                                                           */
/* ------------------------------------------------------------------ */

type DiagramRenderer =
  | { type: "svg-component"; component: () => ReactNode }
  | { type: "satori"; component: () => ReactElement; width: number; height: number };

export const OG_DIAGRAMS: Record<string, DiagramRenderer> = {
  "resolution-path": {
    type: "satori",
    component: ResolutionPathDiagramOG,
    width: 560,
    height: 380,
  },
  "injected-deps": { type: "svg-component", component: InjectedDiagram },
  "node-resolution": { type: "svg-component", component: NodeResolutionDiagram },
  "sync-before-after": { type: "svg-component", component: SyncBeforeAfterDiagram },
  "sync-lifecycle": { type: "svg-component", component: SyncLifecycleDiagram },
};

export { renderSvgComponent };
