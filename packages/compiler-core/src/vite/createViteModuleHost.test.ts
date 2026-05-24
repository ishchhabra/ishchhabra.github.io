import { describe, expect, it } from "vitest";

import { createViteModuleHost } from "./createViteModuleHost";

describe("createViteModuleHost", () => {
  it("preserves Vite worker modules as opaque graph nodes", async () => {
    const host = createViteModuleHost(
      {
        async resolve(specifier) {
          return { id: specifier };
        },
      },
      new Map(),
      {
        environment: { name: "client", consumer: "client" },
      },
    );

    const resolved = await host.resolve("/src/render.worker.ts?worker", null);
    const loaded = await host.load(resolved);

    expect(loaded).toEqual({
      resolvedId: "/src/render.worker.ts?worker",
      sourceName: "/src/render.worker.ts",
      source: null,
      kind: "opaque",
    });
  });

  it("marks client modules with static Node builtin imports as opaque", async () => {
    const source = 'import { Readable } from "node:stream"; export const x = Readable;';
    const host = createViteModuleHost(
      {
        async resolve(specifier) {
          return { id: specifier };
        },
      },
      new Map([["/entry.js", source]]),
      {
        environment: { name: "client", consumer: "client" },
      },
    );

    const loaded = await host.load({
      resolvedId: "/entry.js",
      external: false,
    });

    expect(loaded).toEqual({
      resolvedId: "/entry.js",
      sourceName: "/entry.js",
      source: null,
      kind: "opaque",
    });
  });

  it("keeps server modules with static Node builtin imports inspectable", async () => {
    const source = 'import { Readable } from "node:stream"; export const x = Readable;';
    const host = createViteModuleHost(
      {
        async resolve(specifier) {
          return { id: specifier };
        },
      },
      new Map([["/entry.js", source]]),
      {
        environment: { name: "ssr", consumer: "server" },
      },
    );

    const loaded = await host.load({
      resolvedId: "/entry.js",
      external: false,
    });

    expect(loaded).toEqual({
      resolvedId: "/entry.js",
      sourceName: "/entry.js",
      source,
      kind: "esm",
    });
  });

  it("uses the filesystem path as parser source name for Vite query modules", async () => {
    const source = "const x = y!;";
    const host = createViteModuleHost(
      {
        async resolve(specifier) {
          return { id: specifier };
        },
      },
      new Map([["/entry.tsx?tsr-split=component", source]]),
      {
        environment: { name: "client", consumer: "client" },
      },
    );

    const loaded = await host.load({
      resolvedId: "/entry.tsx?tsr-split=component",
      external: false,
    });

    expect(loaded).toMatchObject({
      resolvedId: "/entry.tsx?tsr-split=component",
      sourceName: "/entry.tsx",
      source,
      kind: "esm",
    });
  });
});
