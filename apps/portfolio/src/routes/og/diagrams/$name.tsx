import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OG_DIAGRAMS } from "../../../lib/og-diagrams";
import { StaticThemeProvider } from "../../../lib/theme";

const require = createRequire(import.meta.url);

function loadOgFonts(): Promise<
  { name: string; data: ArrayBuffer; style: "normal"; weight: 400 | 700 }[]
> {
  try {
    const notoSansDir = path.dirname(require.resolve("@fontsource/noto-sans/package.json"));
    const notoSansRegularPath = path.join(notoSansDir, "files", "noto-sans-latin-400-normal.woff");
    const notoSansBoldPath = path.join(notoSansDir, "files", "noto-sans-latin-700-normal.woff");
    return Promise.all([
      readFile(notoSansRegularPath),
      readFile(notoSansBoldPath),
    ]).then(([regular, bold]) => [
      {
        name: "Noto Sans",
        data: toArrayBuffer(regular),
        style: "normal" as const,
        weight: 400 as const,
      },
      {
        name: "Noto Sans",
        data: toArrayBuffer(bold),
        style: "normal" as const,
        weight: 700 as const,
      },
    ]);
  } catch {
    return Promise.resolve([]);
  }
}

const ogFontsPromise = loadOgFonts();

export const Route = createFileRoute("/og/diagrams/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { name } = params;
        const diagram = OG_DIAGRAMS[name];

        if (!diagram) {
          return new Response("Not found", { status: 404 });
        }

        const DiagramComponent = diagram.component;
        const fonts = await ogFontsPromise;

        if (diagram.type === "svg") {
          return createPngResponse(
            <ComponentWrapper>
              <DiagramComponent />
            </ComponentWrapper>,
            fonts,
          );
        }

        const response = new ImageResponse(<DiagramComponent />, {
          width: diagram.width,
          height: diagram.height,
          ...(fonts.length > 0 && { fonts }),
        });
        response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return response;
      },
    },
  },
});

function ComponentWrapper({ children }: { children: ReactNode }) {
  return <StaticThemeProvider theme="light">{children}</StaticThemeProvider>;
}

function createPngResponse(
  children: ReactNode,
  fonts: Awaited<typeof ogFontsPromise>,
) {
  const markup = renderToStaticMarkup(children);
  const svg = markup.match(/<svg[\s\S]*<\/svg>/)?.[0];

  if (!svg) {
    return new Response("Failed to render PNG", { status: 500 });
  }

  const dimensions = getSvgDimensions(svg);

  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  const response = new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "white",
      }}
    >
      <img
        src={svgDataUri}
        alt=""
        width={dimensions.width}
        height={dimensions.height}
        style={{ width: "100%", height: "100%" }}
      />
    </div>,
    {
      width: dimensions.width,
      height: dimensions.height,
      ...(fonts.length > 0 && { fonts }),
    },
  );
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return response;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

function getSvgDimensions(svg: string) {
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  const viewBox = viewBoxMatch?.[1];
  const viewBoxValues = viewBoxMatch
    ? viewBox!.trim().split(/[\s,]+/).map(Number)
    : null;

  if (
    viewBoxValues &&
    viewBoxValues.length === 4 &&
    viewBoxValues.every((value) => Number.isFinite(value))
  ) {
    const [, , width, height] = viewBoxValues;
    return {
      width: Math.round(width!),
      height: Math.round(height!),
    };
  }

  const widthMatch = svg.match(/width=["']([^"']+)["']/i);
  const heightMatch = svg.match(/height=["']([^"']+)["']/i);
  const width = Number.parseFloat(widthMatch?.[1] ?? "");
  const height = Number.parseFloat(heightMatch?.[1] ?? "");

  if (Number.isFinite(width) && Number.isFinite(height)) {
    return {
      width: Math.round(width),
      height: Math.round(height),
    };
  }

  return { width: 560, height: 350 };
}
