"use client";

import type { ComponentType } from "react";
import { useEffect, useState } from "react";
import { Preview } from "./Preview";
import RenderToStringWorker from "./renderToString.worker?worker";

const glob = import.meta.glob("../../../routes/demos/ssr-theming/*.tsx");

interface DelayedHydrationProps {
  /** Path to the module (must match glob key, e.g. "../../../routes/demos/ssr-theming/….tsx"). */
  modulePath: string;
  /** Named export to render (e.g. "SimpleLocalStorageDemoInner"). */
  exportName: string;
  delay?: number;
  /** Delay after which to switch from server markup to live client render (default 2s). */
  hydrateAfterMs?: number;
}

type WorkerResult = { html?: string; error?: string };

export function DelayedHydration({
  modulePath,
  exportName,
  delay = 1000,
  hydrateAfterMs = 2000,
}: DelayedHydrationProps) {
  const [markup, setMarkup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [Component, setComponent] = useState<ComponentType | null>(null);

  // Load the component for post-hydration render
  useEffect(() => {
    const load = glob[modulePath];
    if (!load) return;
    load()
      .then((mod) => {
        const C = (mod as Record<string, ComponentType>)[exportName];
        if (C) setComponent(() => C);
      })
      .catch(() => {});
  }, [modulePath, exportName]);

  // Run worker on mount to get server markup
  useEffect(() => {
    let worker: InstanceType<typeof RenderToStringWorker> | null = null;

    const id = setTimeout(() => {
      worker = new RenderToStringWorker();

      worker.onmessage = (event: MessageEvent<WorkerResult>) => {
        const data = event.data;
        if (data.error) setError(data.error);
        else if (data.html) setMarkup(data.html);
      };

      worker.postMessage({ modulePath, exportName });
    }, delay);

    return () => {
      clearTimeout(id);
      worker?.terminate();
    };
  }, [modulePath, exportName, delay]);

  // After hydrateAfterMs, switch from static markup to live component
  useEffect(() => {
    const id = setTimeout(() => setHydrated(true), hydrateAfterMs);
    return () => clearTimeout(id);
  }, [hydrateAfterMs]);

  if (error) return <div role="alert">Error: {error}</div>;
  if (hydrated && Component) return <Component />;
  if (markup === null) return <Preview.Spinner label="Loading server markup…" />;
  return <div dangerouslySetInnerHTML={{ __html: markup }} />;
}
