import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

import { IRIdAllocator } from "../ir/core/IRIdAllocator";
import { ModuleIRBuilder } from "./ModuleIRBuilder";

function emptyProgram() {
  return parseSync("input.js", "", {
    sourceType: "module",
    astType: "ts",
  }).program;
}

function program(source: string) {
  return parseSync("input.js", source, {
    sourceType: "module",
    astType: "ts",
  }).program;
}

function tsProgram(source: string) {
  return parseSync("input.ts", source, {
    sourceType: "module",
    astType: "ts",
  }).program;
}

function buildModule(source: string) {
  return new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(tsProgram(source));
}

describe("ModuleIRBuilder", () => {
  it("builds a module with an entry function and entry block", () => {
    const builder = new ModuleIRBuilder({
      ids: new IRIdAllocator(),
    });

    const { moduleIR, declarations } = builder.build(emptyProgram());

    expect(moduleIR.id).toBe(0);
    expect(declarations).toBeDefined();
    expect(moduleIR.functions).toHaveLength(1);
    expect(moduleIR.entryFunction).toBe(moduleIR.functions[0]);
    expect(moduleIR.entryFunction?.ownerModule).toBe(moduleIR);
    expect(moduleIR.entryFunction?.entryBlock.id).toBe(0);
    expect(moduleIR.entryFunction?.entryBlock.ownerFunction).toBe(moduleIR.entryFunction);
  });

  it("uses the provided id allocator across builds", () => {
    const ids = new IRIdAllocator();
    const firstBuilder = new ModuleIRBuilder({ ids });
    const secondBuilder = new ModuleIRBuilder({ ids });

    const { moduleIR: firstModule } = firstBuilder.build(emptyProgram());
    const { moduleIR: secondModule } = secondBuilder.build(emptyProgram());

    expect(firstModule.id).toBe(0);
    expect(firstModule.entryFunction?.id).toBe(0);
    expect(firstModule.entryFunction?.entryBlock.id).toBe(0);

    expect(secondModule.id).toBe(1);
    expect(secondModule.entryFunction?.id).toBe(1);
    expect(secondModule.entryFunction?.entryBlock.id).toBe(1);
  });

  it("records static imports and exports on the module", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      program(`
        import "./setup.js";
        import def, { a, b as c } from "./m.js";
        import * as ns from "./n.js";
        export const x = 1;
        const y = 2;
        export { y as z };
        export { a as aa } from "./m.js";
        export * from "./all.js";
        export * as everything from "./all.js";
      `),
    );

    expect(moduleIR.imports).toMatchObject([
      { kind: "bare", source: "./setup.js" },
      { kind: "default", source: "./m.js", localName: "def" },
      {
        kind: "named",
        source: "./m.js",
        importedName: { kind: "identifier", name: "a" },
        localName: "a",
      },
      {
        kind: "named",
        source: "./m.js",
        importedName: { kind: "identifier", name: "b" },
        localName: "c",
      },
      { kind: "namespace", source: "./n.js", localName: "ns" },
    ]);
    expect(moduleIR.exports).toMatchObject([
      {
        kind: "local",
        localName: "x",
        exportedName: { kind: "identifier", name: "x" },
      },
      {
        kind: "local",
        localName: "y",
        exportedName: { kind: "identifier", name: "z" },
      },
      {
        kind: "re-export",
        source: "./m.js",
        importedName: { kind: "identifier", name: "a" },
        exportedName: { kind: "identifier", name: "aa" },
      },
      { kind: "export-all", source: "./all.js", exportedName: null },
      {
        kind: "export-all",
        source: "./all.js",
        exportedName: { kind: "identifier", name: "everything" },
      },
    ]);
  });

  it("records module names, attributes, and type-only erasure", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      tsProgram(`
        import type { T } from "./types.js";
        import { type U } from "./m-types.js";
        import { "remote-name" as local } from "./m.js" with { type: "json" };
        const value = 1;
        export { type T, value as "public-name" };
        export { "remote-name" as re } from "./m.js" with { type: "json" };
        export * from "./all.js" with { type: "json" };
      `),
    );

    expect(moduleIR.imports).toMatchObject([
      {
        kind: "named",
        source: "./m.js",
        importedName: { kind: "string", value: "remote-name" },
        localName: "local",
        attributes: [
          {
            key: { kind: "identifier", name: "type" },
            value: "json",
          },
        ],
      },
    ]);
    expect(moduleIR.exports).toMatchObject([
      {
        kind: "local",
        localName: "value",
        exportedName: { kind: "string", value: "public-name" },
      },
      {
        kind: "re-export",
        source: "./m.js",
        importedName: { kind: "string", value: "remote-name" },
        exportedName: { kind: "identifier", name: "re" },
        attributes: [
          {
            key: { kind: "identifier", name: "type" },
            value: "json",
          },
        ],
      },
      {
        kind: "export-all",
        source: "./all.js",
        attributes: [
          {
            key: { kind: "identifier", name: "type" },
            value: "json",
          },
        ],
      },
    ]);
  });

  it("records default value exports without inventing a binding", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      program("export default foo();"),
    );

    expect(moduleIR.exports).toMatchObject([{ kind: "default-value" }]);
  });

  it("erases ambient TypeScript module declarations", () => {
    const { moduleIR } = buildModule(`
      declare module "@tanstack/react-router" {
        interface Register {
          router: unknown;
        }
      }
    `);

    expect(moduleIR.entryFunction?.entryBlock.operations).toHaveLength(0);
  });

  it("erases type-only TypeScript declarations", () => {
    const { moduleIR } = buildModule(`
      interface A {}
      type B = A;
      declare enum E {}
      import type X = import("x");
    `);

    expect(moduleIR.entryFunction?.entryBlock.operations).toHaveLength(0);
  });

  it("erases type-only TypeScript expression wrappers", () => {
    expect(() =>
      buildModule(`
        const a = foo!;
        const b = foo as string;
        const c = foo satisfies string;
        const d = <string>foo;
        foo<string>();
      `),
    ).not.toThrow();
  });

  it("collects scopes through chained member calls", () => {
    expect(() =>
      buildModule(`
        const value = createServerFn({ method: "POST" })
          .inputValidator((data: unknown) => data as { source: string })
          .handler(async ({ data }) => data.source);
      `),
    ).not.toThrow();
  });

  it("rejects runtime TypeScript namespaces", () => {
    expect(() =>
      buildModule(`
        namespace Runtime {
          export const x = 1;
        }
      `),
    ).toThrow("Runtime TypeScript namespaces require namespace lowering");
  });
});
