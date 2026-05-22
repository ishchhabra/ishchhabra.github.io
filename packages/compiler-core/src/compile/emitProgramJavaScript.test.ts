import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import { buildProgram } from "./buildProgram";
import { emitProgramJavaScript } from "./emitProgramJavaScript";
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

describe("emitProgramJavaScript", () => {
  it("emits JavaScript for lowered modules", async () => {
    const ids = new IRIdAllocator();
    const result = await buildProgram({
      ids,
      host: new TestModuleHost(
        new Map([
          ["/entry.js", 'import "./dep.js"; export const x = 1;'],
          ["/dep.js", "export const y = 2;"],
        ]),
      ),
      entrypoints: ["./entry.js"],
    });

    runProgramCompilerPasses(result, ids);

    const output = emitProgramJavaScript(result);

    expect(output.size).toBe(2);
    expect([...output.keys()].map((module) => module.resolvedId)).toEqual(["/entry.js", "/dep.js"]);
    expect(output.get(result.program.modules[0])).toContain("export { $d0 as x };");
    expect(output.get(result.program.modules[1])).toContain("export { $d1 as y };");
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

    const output = emitProgramJavaScript(result);

    expect(result.program.modules.map((module) => module.resolvedId)).toEqual([
      "/entry.js",
      "external-package",
    ]);
    expect(output.size).toBe(1);
    expect(output.has(result.program.modules[1])).toBe(false);
  });
});
