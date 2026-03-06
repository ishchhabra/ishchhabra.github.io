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
          const vb = svg.match(/viewBox="0 0 (\d+) ([\d.]+)"/);
          const width = vb ? Number(vb[1]) : 560;
          const height = vb ? Math.ceil(Number(vb[2])) : 400;
          const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
          const response = new ImageResponse(
            <img src={dataUri} width={width} height={height} />,
            { width, height },
          );
          response.headers.set(
            "Cache-Control",
            "public, max-age=31536000, immutable",
          );
          return response;
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
