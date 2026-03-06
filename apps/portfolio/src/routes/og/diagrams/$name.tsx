import { createFileRoute } from "@tanstack/react-router";
import { OG_DIAGRAMS, renderSvgComponent } from "../../../lib/og-diagrams";

async function renderDiagramPng(name: string): Promise<Uint8Array> {
  const diagram = OG_DIAGRAMS[name];
  if (!diagram) {
    throw new Error(`Unknown diagram: ${name}`);
  }

  let svg: string;

  if (diagram.type === "svg-component") {
    svg = renderSvgComponent(diagram.component);
  } else {
    const satori = (await import("satori")).default;
    svg = await satori(diagram.component(), {
      width: diagram.width,
      height: diagram.height,
      fonts: [
        {
          name: "sans-serif",
          data: await fetch(
            "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.woff",
          ).then((r) => r.arrayBuffer()),
          weight: 400,
          style: "normal" as const,
        },
        {
          name: "sans-serif",
          data: await fetch(
            "https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-600-normal.woff",
          ).then((r) => r.arrayBuffer()),
          weight: 600,
          style: "normal" as const,
        },
      ],
    });
  }

  const { Resvg } = await import("@resvg/resvg-js");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });
  return resvg.render().asPng();
}

export const Route = createFileRoute("/og/diagrams/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { name } = params;

        if (!OG_DIAGRAMS[name]) {
          return new Response("Not found", { status: 404 });
        }

        const png = await renderDiagramPng(name);
        return new Response(png as unknown as BodyInit, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
