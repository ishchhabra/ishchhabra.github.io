import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ObjectLiteralOp } from "../../ir/ops/objects/ObjectLiteralOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerObjectExpression", () => {
  it("lowers properties, computed keys, and spreads in source order", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const obj = { x, y: z, [k]: v, ...rest };"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "LoadGlobalOp",
      "LoadGlobalOp",
      "LoadGlobalOp",
      "ObjectLiteralOp",
      "InitializeBindingOp",
    ]);

    const literal = operations[5] as ObjectLiteralOp;
    expect(literal.properties).toEqual([
      {
        kind: "property",
        key: { kind: "static", name: "x" },
        value: operations[0].result,
      },
      {
        kind: "property",
        key: { kind: "static", name: "y" },
        value: operations[1].result,
      },
      {
        kind: "property",
        key: { kind: "computed", value: operations[2].result },
        value: operations[3].result,
      },
      { kind: "spread", value: operations[4].result },
    ]);
  });

  it("lowers object methods and accessors as object literal elements", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule(
        "test.js",
        "const obj = { method() {}, get x() { return 1; }, set x(value) {} };",
      ),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const literal = operations[0] as ObjectLiteralOp;

    expect(literal.properties.map((property) => property.kind)).toEqual([
      "method",
      "accessor",
      "accessor",
    ]);
    expect(literal.properties[0]).toMatchObject({
      kind: "method",
      key: { kind: "static", name: "method" },
    });
    expect(literal.properties[1]).toMatchObject({
      kind: "accessor",
      accessor: "get",
      key: { kind: "static", name: "x" },
    });
    expect(literal.properties[2]).toMatchObject({
      kind: "accessor",
      accessor: "set",
      key: { kind: "static", name: "x" },
    });
  });

  it("preserves async and generator flags on object methods", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const obj = { async method() {}, *gen() {} };"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];
    const literal = operations[0] as ObjectLiteralOp;

    expect(literal.properties[0]).toMatchObject({
      kind: "method",
      functionIR: { isAsync: true, isGenerator: false },
    });
    expect(literal.properties[1]).toMatchObject({
      kind: "method",
      functionIR: { isAsync: false, isGenerator: true },
    });
  });
});
