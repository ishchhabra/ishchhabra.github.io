import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { ImageResponse } from "@vercel/og";
import React, { type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OG_DIAGRAMS } from "../src/lib/og-diagrams";
import { StaticThemeProvider } from "../src/lib/theme";

const outputDir = path.resolve(import.meta.dirname, "../public/og/diagrams");
const dmSansRegularPath = path.resolve(import.meta.dirname, "../assets/fonts/DMSans-Regular.ttf");
const dmSansBoldPath = path.resolve(import.meta.dirname, "../assets/fonts/DMSans-Bold.ttf");
const jetBrainsMonoRegularPath = path.resolve(
  import.meta.dirname,
  "../assets/fonts/JetBrainsMono-Regular.ttf",
);
const jetBrainsMonoBoldPath = path.resolve(import.meta.dirname, "../assets/fonts/JetBrainsMono-Bold.ttf");

const resvgFontFiles = [dmSansRegularPath, dmSansBoldPath, jetBrainsMonoRegularPath, jetBrainsMonoBoldPath];

async function main() {
  await mkdir(outputDir, { recursive: true });
  await removeStalePngs();

  const ogFonts = await loadOgFonts();

  for (const [name, diagram] of Object.entries(OG_DIAGRAMS)) {
    const png = await (diagram.type === "svg"
      ? renderSvgDiagramToPng(diagram.component)
      : renderSatoriDiagramToPng(diagram.component, diagram.width, diagram.height, ogFonts));

    const outputPath = path.join(outputDir, `${name}.png`);
    await writeFile(outputPath, png);
    console.log(`generated ${path.relative(path.resolve(import.meta.dirname, ".."), outputPath)}`);
  }
}

async function removeStalePngs() {
  const expectedNames = new Set(Object.keys(OG_DIAGRAMS).map((name) => `${name}.png`));
  const existingEntries = await readdir(outputDir, { withFileTypes: true }).catch(() => []);

  await Promise.all(
    existingEntries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".png") && !expectedNames.has(entry.name))
      .map((entry) => rm(path.join(outputDir, entry.name))),
  );
}

async function loadOgFonts() {
  const [sansRegular, sansBold, monoRegular, monoBold] = await Promise.all([
    readFile(dmSansRegularPath),
    readFile(dmSansBoldPath),
    readFile(jetBrainsMonoRegularPath),
    readFile(jetBrainsMonoBoldPath),
  ]);

  return [
    { name: "DM Sans", data: toArrayBuffer(sansRegular), style: "normal" as const, weight: 400 as const },
    { name: "DM Sans", data: toArrayBuffer(sansBold), style: "normal" as const, weight: 700 as const },
    {
      name: "JetBrains Mono",
      data: toArrayBuffer(monoRegular),
      style: "normal" as const,
      weight: 400 as const,
    },
    {
      name: "JetBrains Mono",
      data: toArrayBuffer(monoBold),
      style: "normal" as const,
      weight: 700 as const,
    },
  ];
}

function renderSvgDiagramToPng(component: () => ReactNode) {
  const DiagramComponent = component;
  const markup = renderToStaticMarkup(
    <StaticThemeProvider theme="light">
      <DiagramComponent />
    </StaticThemeProvider>,
  );
  const svg = markup.match(/<svg[\s\S]*<\/svg>/)?.[0];

  if (!svg) {
    throw new Error("Failed to extract SVG markup");
  }

  const resvg = new Resvg(withEmbeddedFontStyles(svg), {
    background: "white",
    font: {
      loadSystemFonts: false,
      fontFiles: resvgFontFiles,
      defaultFontFamily: "DM Sans",
      sansSerifFamily: "DM Sans",
      monospaceFamily: "JetBrains Mono",
    },
  });

  return resvg.render().asPng();
}

async function renderSatoriDiagramToPng(
  component: () => ReactNode,
  width: number,
  height: number,
  fonts: Awaited<ReturnType<typeof loadOgFonts>>,
) {
  const DiagramComponent = component as () => ReactElement;
  const response = new ImageResponse(<DiagramComponent />, {
    width,
    height,
    fonts,
  });

  return Buffer.from(await response.arrayBuffer());
}

function withEmbeddedFontStyles(svg: string) {
  const withMonoFamily = svg.replaceAll('font-family="monospace"', 'font-family="JetBrains Mono"');

  return withMonoFamily.replace(
    /<svg([^>]*)>/,
    `<svg$1><style>text,tspan{font-family:'DM Sans';}</style>`,
  );
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}

main().catch((error: unknown) => {
  console.error("Failed to generate OG diagrams");
  console.error(error);
  process.exit(1);
});
