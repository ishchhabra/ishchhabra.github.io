import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import { buildProgram } from "./buildProgram";
import type { LoadedModule, ModuleHost, ResolvedModule } from "./ModuleHost";
import { runProgramCompilerPasses } from "./runProgramCompilerPasses";

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
        source: null,
        kind: "opaque",
      };
    }

    return {
      resolvedId: resolved.resolvedId,
      source,
      kind: "esm",
    };
  }
}

describe("runProgramCompilerPasses", () => {
  it("runs local passes for lowered modules", async () => {
    const ids = new IRIdAllocator();
    const result = await buildProgram({
      ids,
      host: new TestModuleHost(
        new Map([
          ["/entry.js", 'import "./dep.js"; let x = 1; x = 2;'],
          ["/dep.js", "let y = 1; y = 2;"],
        ]),
      ),
      entrypoints: ["./entry.js"],
    });

    runProgramCompilerPasses(result, ids);

    for (const buildResult of result.moduleBuilds.values()) {
      expect(buildResult.moduleIR.functions.length).toBeGreaterThan(0);
    }
  });

  it("skips external modules by construction", async () => {
    const ids = new IRIdAllocator();
    const result = await buildProgram({
      ids,
      host: new TestModuleHost(
        new Map([["/entry.js", 'import "external-package"; export const x = 1;']]),
      ),
      entrypoints: ["./entry.js"],
    });

    runProgramCompilerPasses(result, ids);

    expect(result.program.modules.map((module) => module.resolvedId)).toEqual([
      "/entry.js",
      "external-package",
    ]);
    expect(result.moduleBuilds.size).toBe(1);
  });
});
