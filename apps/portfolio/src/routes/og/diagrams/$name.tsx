import { ImageResponse } from "@vercel/og";
import { createFileRoute } from "@tanstack/react-router";
import { OG_DIAGRAMS, renderSvgComponent } from "../../../lib/og-diagrams";

function renderDiagramResponse(name: string): ImageResponse {
  const diagram = OG_DIAGRAMS[name];
  if (!diagram) {
    throw new Error(`Unknown diagram: ${name}`);
  }

  if (diagram.type === "svg-component") {
    const svg = renderSvgComponent(diagram.component);
    const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    return new ImageResponse(<img src={dataUri} width="100%" height="100%" />, {
      width: 1200,
      height: 800,
    });
  }

  return new ImageResponse(diagram.component(), {
    width: diagram.width,
    height: diagram.height,
  });
}

export const Route = createFileRoute("/og/diagrams/$name")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const { name } = params;

        if (!OG_DIAGRAMS[name]) {
          return new Response("Not found", { status: 404 });
        }

        const response = renderDiagramResponse(name);
        response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return response;
      },
    },
  },
});
