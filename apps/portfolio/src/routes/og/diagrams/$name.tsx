import { ImageResponse } from "@vercel/og";
import { createFileRoute } from "@tanstack/react-router";
import { OG_DIAGRAMS, renderSvgComponent } from "../../../lib/og-diagrams";

export const Route = createFileRoute("/og/diagrams/$name")({
  server: {
    handlers: {
      GET: ({ params }) => {
        const { name } = params;
        const diagram = OG_DIAGRAMS[name];

        if (!diagram) {
          return new Response("Not found", { status: 404 });
        }

        if (diagram.type === "svg") {
          const svg = renderSvgComponent(diagram.component);
          return new Response(svg, {
            headers: {
              "Content-Type": "image/svg+xml",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }

        const response = new ImageResponse(diagram.component(), {
          width: diagram.width,
          height: diagram.height,
        });
        response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return response;
      },
    },
  },
});
