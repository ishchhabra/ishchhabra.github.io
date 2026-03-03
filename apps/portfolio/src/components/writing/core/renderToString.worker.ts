import { type ComponentType, createElement } from "react";
import { renderToReadableStream } from "react-dom/server";

const glob = import.meta.glob("../../../routes/demos/ssr-theming/*.tsx");

type WorkerInput = { modulePath: string; exportName: string };

self.onmessage = async (event: MessageEvent<WorkerInput>) => {
  const { modulePath, exportName } = event.data;
  try {
    const load = glob[modulePath];
    if (!load) {
      self.postMessage({ error: `Unknown module: ${modulePath}` });
      return;
    }
    const mod = (await load()) as Record<string, ComponentType>;
    const Component = mod[exportName];
    if (!Component) {
      self.postMessage({
        error: `Missing export "${exportName}" in ${modulePath}`,
      });
      return;
    }

    const stream = await renderToReadableStream(createElement(Component));
    const html = await new Response(stream).text();

    self.postMessage({ html });
  } catch (err) {
    self.postMessage({
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
