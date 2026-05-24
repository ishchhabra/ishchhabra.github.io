import { describe, expect, it } from "vitest";

import type { LoadedModule, ModuleHost, ResolvedModule } from "./ModuleHost";
import { ProgramSession } from "./ProgramSession";

class TestModuleHost implements ModuleHost {
  constructor(private readonly modules: ReadonlyMap<string, string>) {}

  public async resolve(specifier: string, importer: string | null): Promise<ResolvedModule> {
    if (!specifier.startsWith(".")) {
      return { resolvedId: specifier, external: true };
    }

    const base = importer === null ? "" : importer.slice(0, importer.lastIndexOf("/"));

    return {
      resolvedId: `${base}/${specifier.replace(/^\.\//, "")}`,
      external: false,
    };
  }

  public async load(resolved: ResolvedModule): Promise<LoadedModule> {
    const source = this.modules.get(resolved.resolvedId);
    if (source === undefined) {
      return {
        resolvedId: resolved.resolvedId,
        sourceName: resolved.resolvedId,
        source: null,
        kind: "opaque",
      };
    }

    return {
      resolvedId: resolved.resolvedId,
      sourceName: resolved.resolvedId,
      source,
      kind: "esm",
    };
  }
}

describe("ProgramSession", () => {
  it("owns graph emissions independently of bundler adapters", async () => {
    const session = new ProgramSession();
    const environment = { name: "client", consumer: "client" } as const;

    const result = await session.compileGraph({
      environment,
      host: new TestModuleHost(
        new Map([
          ["/entry.js", 'import { value } from "./dep.js"; export const result = value;'],
          ["/dep.js", "export const value = 1;"],
        ]),
      ),
      entrypoints: ["./entry.js"],
    });

    expect(result.emissions.get("/entry.js")).toMatchObject({ kind: "code" });
    expect(result.emissions.get("/dep.js")).toMatchObject({ kind: "code" });
    expect(
      session.emissionFor({
        environment,
        resolvedId: "/dep.js",
      }),
    ).toMatchObject({ kind: "code" });
    expect(
      session.emissionFor({
        environment,
        graphId: result.graphId,
        resolvedId: "/dep.js",
      }),
    ).toMatchObject({ kind: "code" });
  });

  it("records opaque graph-owned modules explicitly", async () => {
    const session = new ProgramSession();
    const environment = { name: "client", consumer: "client" } as const;

    const result = await session.compileGraph({
      environment,
      host: new TestModuleHost(
        new Map([["/entry.js", 'import "./missing.js"; export const result = 1;']]),
      ),
      entrypoints: ["./entry.js"],
    });

    expect(result.emissions.get("/missing.js")).toEqual({ kind: "opaque" });
  });
});
