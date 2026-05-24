import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import { buildProgram } from "./buildProgram";
import type { LoadedModule, ModuleHost, ResolvedModule } from "./ModuleHost";

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

describe("buildProgram", () => {
  it("builds modules and dependencies from static imports", async () => {
    const result = await buildProgram({
      ids: new IRIdAllocator(),
      host: new TestModuleHost(
        new Map([
          ["/entry.js", 'import { x } from "./dep.js"; export const y = x;'],
          ["/dep.js", "export const x = 1;"],
        ]),
      ),
      entrypoints: ["./entry.js"],
    });
    const program = result.program;

    expect(program.modules.map((module) => module.resolvedId)).toEqual(["/entry.js", "/dep.js"]);
    expect(program.entrypoints.map((module) => module.resolvedId)).toEqual(["/entry.js"]);
    expect(program.dependencies).toHaveLength(1);
    expect(program.dependencies[0].kind).toBe("static-import");
    expect(result.moduleBuilds.size).toBe(2);
  });

  it("deduplicates dependency edges by specifier and kind", async () => {
    const result = await buildProgram({
      ids: new IRIdAllocator(),
      host: new TestModuleHost(
        new Map([
          [
            "/entry.js",
            'import { x } from "./dep.js"; import { y } from "./dep.js"; export const z = x + y;',
          ],
          ["/dep.js", "export const x = 1; export const y = 2;"],
        ]),
      ),
      entrypoints: ["./entry.js"],
    });

    expect(result.program.dependencies).toHaveLength(1);
    expect(result.program.dependencies[0]).toMatchObject({
      kind: "static-import",
      specifier: "./dep.js",
    });
  });
});
