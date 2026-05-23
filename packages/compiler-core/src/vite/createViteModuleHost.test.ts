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
      source,
      kind: "esm",
    });
  });
});
