import { createFileRoute } from "@tanstack/react-router";
import { ImageResponse } from "@vercel/og";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OG_DIAGRAMS } from "../../../lib/og-diagrams";
import { StaticThemeProvider } from "../../../lib/theme";

export const Route = createFileRoute("/og/diagrams/$name")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const { name } = params;
        const diagram = OG_DIAGRAMS[name];

        if (!diagram) {
          return new Response("Not found", { status: 404 });
        }

        const DiagramComponent = diagram.component;

        if (diagram.type === "svg") {
          return createPngResponse(
            <ComponentWrapper>
              <DiagramComponent />
            </ComponentWrapper>,
          );
        }

        const response = new ImageResponse(<DiagramComponent />, {
          width: diagram.width,
          height: diagram.height,
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

function createPngResponse(children: ReactNode) {
  const markup = renderToStaticMarkup(children);
  const svg = markup.match(/<svg[\s\S]*<\/svg>/)?.[0];

  if (!svg) {
    return new Response("Failed to render PNG", { status: 500 });
  }

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
        width="560"
        height="350"
        style={{ width: "100%", height: "100%" }}
      />
    </div>,
    {
      width: 560,
      height: 350,
    },
  );
  response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return response;
}
