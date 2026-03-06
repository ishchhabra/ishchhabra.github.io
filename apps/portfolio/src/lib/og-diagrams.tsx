/**
 * Diagram renderers for OG image generation.
 *
 * SVG diagrams: renderToStaticMarkup → extract <svg> → served as image/svg+xml
 * HTML diagrams (ResolutionPathDiagram): Satori-compatible JSX → @vercel/og
 */

import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  InjectedDiagram,
  NodeResolutionDiagram,
} from "../components/writing/pnpm-monorepo/SymlinkDiagram";
import {
  SyncBeforeAfterDiagram,
  SyncLifecycleDiagram,
} from "../components/writing/pnpm-monorepo/SyncLifecycleDiagram";
import { diagramPalette } from "../components/writing/pnpm-monorepo/diagramColors";
import { StaticThemeProvider } from "./theme";

export function renderSvgComponent(Component: () => ReactNode): string {
  const html = renderToStaticMarkup(
    <StaticThemeProvider theme="light">
      <Component />
    </StaticThemeProvider>,
  );
  const match = html.match(/<svg[\s\S]*<\/svg>/);
  if (!match) {
    throw new Error("No SVG found in rendered output");
  }
  let svg = match[0];

  // Remove the background <rect> (first rect child) for transparent background
  svg = svg.replace(/<rect width="[^"]*" height="[^"]*" rx="16" fill="[^"]*"><\/rect>/, "");

  // Ensure explicit width/height from viewBox so <img> tags size correctly
  const svgTag = svg.match(/^<svg[^>]*>/)?.[0] ?? "";
  const vb = svgTag.match(/viewBox="0 0 (\d+) ([\d.]+)"/);
  if (vb && !svgTag.includes('width="')) {
    svg = svg.replace(/^<svg/, `<svg width="${vb[1]}" height="${vb[2]}"`);
  }

  return svg;
}

/* ------------------------------------------------------------------ */
/*  ResolutionPathDiagram — Satori version (CSS borders, no Unicode)  */
/* ------------------------------------------------------------------ */

const c = diagramPalette.light;

function TreeLine({ height }: { height: number }) {
  return (
    <div
      style={{
        display: "flex",
        width: 1,
        height,
        backgroundColor: c.border,
        marginLeft: 5,
      }}
    />
  );
}

function TreeBranch({ children, last }: { children: ReactNode; last?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 14,
          height: 24,
          position: "relative",
        }}
      >
        {/* Vertical segment */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 5,
            top: 0,
            width: 1,
            height: last ? 12 : 24,
            backgroundColor: c.border,
          }}
        />
        {/* Horizontal segment */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 5,
            top: 12,
            width: 9,
            height: 1,
            backgroundColor: c.border,
          }}
        />
      </div>
      {children}
    </div>
  );
}

function Badge({ text, color, bold }: { text: string; color: string; bold?: boolean }) {
  return (
    <span
      style={{
        display: "flex",
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: bold ? 600 : 500,
        backgroundColor: `${color}15`,
        color,
      }}
    >
      {text}
    </span>
  );
}

function ResolutionPathDiagramOG(): ReactElement {
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
        fontFamily: "monospace",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          padding: "10px 20px",
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
          }}
        >
          HOW NODE RESOLVES REQUIRE("REACT")
        </span>
      </div>

      {/* Tree content */}
      <div style={{ display: "flex", flexDirection: "column", padding: 20, fontSize: 12.5 }}>
        {/* packages/ui/ */}
        <div style={{ display: "flex", color: c.heading, fontWeight: 600 }}>packages/ui/</div>

        <div style={{ display: "flex", flexDirection: "column", paddingLeft: 20 }}>
          {/* dist/index.js */}
          <TreeBranch>
            <span style={{ color: c.body }}>dist/index.js</span>
            <Badge text={'require("react") starts here'} color={c.blue} />
          </TreeBranch>

          {/* Node walks up... */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <TreeLine height={20} />
            <span style={{ fontSize: 10, fontStyle: "italic", color: c.caption, paddingLeft: 8 }}>
              Node walks up...
            </span>
          </div>

          {/* node_modules/react — FOUND */}
          <TreeBranch last>
            <span style={{ color: c.body }}>node_modules/react</span>
            <Badge text="Found — stops here" color={c.orange} bold />
          </TreeBranch>
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
          <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${c.border}` }} />
          <span
            style={{
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.15em",
              color: c.caption,
            }}
          >
            NEVER REACHES
          </span>
          <div style={{ flex: 1, height: 1, borderTop: `1px dashed ${c.border}` }} />
        </div>

        {/* apps/my-app/ — dimmed */}
        <div style={{ display: "flex", flexDirection: "column", opacity: 0.45 }}>
          <div style={{ display: "flex", color: c.heading, fontWeight: 600 }}>apps/my-app/</div>
          <div style={{ display: "flex", flexDirection: "column", paddingLeft: 20 }}>
            <TreeBranch last>
              <span style={{ color: c.body }}>node_modules/react</span>
              <Badge text="the app's copy" color={c.red} />
            </TreeBranch>
          </div>
        </div>

        {/* Summary */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 20,
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            backgroundColor: c.cardAlt,
            padding: 12,
            fontSize: 11.5,
            lineHeight: 1.6,
            color: c.body,
          }}
        >
          <span style={{ display: "flex" }}>
            Even if both are the{" "}
            <span style={{ color: c.heading, fontWeight: 600 }}>&nbsp;exact same version</span>,
            Node loads them as separate modules.
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
  | { type: "svg"; component: () => ReactNode }
  | { type: "satori"; component: () => ReactElement; width: number; height: number };

export const OG_DIAGRAMS: Record<string, DiagramRenderer> = {
  "resolution-path": {
    type: "satori",
    component: ResolutionPathDiagramOG,
    width: 560,
    height: 350,
  },
  "injected-deps": { type: "svg", component: InjectedDiagram },
  "node-resolution": { type: "svg", component: NodeResolutionDiagram },
  "sync-before-after": { type: "svg", component: SyncBeforeAfterDiagram },
  "sync-lifecycle": { type: "svg", component: SyncLifecycleDiagram },
};
