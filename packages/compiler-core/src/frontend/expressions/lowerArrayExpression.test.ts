import { describe, expect, it } from "vitest";
import { IRIdAllocator } from "../../ir/core/IRIdAllocator";
import { ArrayLiteralOp } from "../../ir/ops/objects/ArrayLiteralOp";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { parseModule } from "../parse/parseModule";

describe("lowerArrayExpression", () => {
  it("lowers values, holes, and spreads in source order", () => {
    const { moduleIR } = new ModuleIRBuilder({ ids: new IRIdAllocator() }).build(
      parseModule("test.js", "const xs = [a, , ...b];"),
    );
    const operations = moduleIR.entryFunction?.entryBlock.operations ?? [];

    expect(operations.map((op) => op.constructor.name)).toEqual([
      "LoadGlobalOp",
      "LoadGlobalOp",
      "ArrayLiteralOp",
      "InitializeBindingOp",
    ]);

    const literal = operations[2] as ArrayLiteralOp;
    expect(literal.elements).toEqual([
      { kind: "value", value: operations[0].result },
      { kind: "hole" },
      { kind: "spread", value: operations[1].result },
    ]);
  });
});
